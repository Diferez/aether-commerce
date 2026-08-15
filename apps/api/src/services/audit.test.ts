import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@aether/schemas";
import type { Env } from "../types";
import { auditService, recordAudit, writeAuditLog } from "./audit";

function fakeEnv() {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => {
        statements.push({ sql, args });
        return { run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })) };
      })
    }))
  };
  return { env: { DB: db } as unknown as Env, statements };
}

describe("writeAuditLog", () => {
  it("inserts into audit_logs with the given actor, action, target and a serialized payload", async () => {
    const { env, statements } = fakeEnv();
    await writeAuditLog(env, {
      actorId: "usr_admin",
      action: "product.created",
      targetType: "product",
      targetId: "prd_1",
      payload: { name: "Funda Slim Grip" }
    });

    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toContain("insert into audit_logs");
    const [, actorId, action, targetType, targetId, payloadJson] = statements[0]!.args;
    expect(actorId).toBe("usr_admin");
    expect(action).toBe("product.created");
    expect(targetType).toBe("product");
    expect(targetId).toBe("prd_1");
    expect(JSON.parse(payloadJson as string)).toEqual({ name: "Funda Slim Grip" });
  });

  it("defaults the payload to an empty object when omitted", async () => {
    const { env, statements } = fakeEnv();
    await writeAuditLog(env, { actorId: "usr_admin", action: "coupon.deactivated", targetType: "coupon", targetId: "SAVE10" });

    const [, , , , , payloadJson] = statements[0]!.args;
    expect(JSON.parse(payloadJson as string)).toEqual({});
  });

  it("accepts a null targetId for actions with no single target", async () => {
    const { env, statements } = fakeEnv();
    await writeAuditLog(env, { actorId: "usr_admin", action: "product.bulk_visibility_changed", targetType: "product", targetId: null, payload: { ids: ["prd_1", "prd_2"] } });

    const [, , , , targetId] = statements[0]!.args;
    expect(targetId).toBeNull();
  });
});

function fakeActor(overrides: Partial<Actor> = {}): Actor {
  return { userId: "usr_admin", roles: ["admin"], permissions: [], mode: "private", ...overrides };
}

describe("recordAudit", () => {
  it("sources actor id and role from the session actor, never from any request body", async () => {
    const { env, statements } = fakeEnv();
    await recordAudit(env, {
      actor: fakeActor({ userId: "usr_1", roles: ["super_admin"] }),
      action: "product.updated",
      entity: { type: "product", id: "prd_1" },
      requestId: "req_1"
    });

    const args = statements[0]!.args;
    expect(args).toContain("usr_1");
    expect(args).toContain("super_admin");
    expect(args).toContain("req_1");
  });

  it("defaults actor_id to 'unknown' for an actor with no userId, instead of writing an empty string", async () => {
    const { env, statements } = fakeEnv();
    await recordAudit(env, {
      actor: fakeActor({ userId: undefined }),
      action: "security.suspicious_activity",
      entity: { type: "system", id: null },
      requestId: "req_1"
    });

    expect(statements[0]!.args).toContain("unknown");
  });

  it("stores only the fields that actually changed between previousData and newData, not two full snapshots", async () => {
    const { env, statements } = fakeEnv();
    await recordAudit(env, {
      actor: fakeActor(),
      action: "product.price_changed",
      entity: { type: "product", id: "prd_1" },
      previousData: { name: "Funda A", priceCents: 1000, stock: 5 },
      newData: { name: "Funda A", priceCents: 1200, stock: 5 },
      requestId: "req_1"
    });

    // Column order per recordAudit's insert: id, actor_id, actor_role,
    // action, target_type, target_id, payload_json, previous_data, new_data, ...
    const [, , , , , , , previousDataJson, newDataJson] = statements[0]!.args as string[];

    expect(JSON.parse(previousDataJson!)).toEqual({ priceCents: 1000 });
    expect(JSON.parse(newDataJson!)).toEqual({ priceCents: 1200 });
  });

  it("redacts secrets out of previousData, newData, and metadata before storing them", async () => {
    const { env, statements } = fakeEnv();
    await recordAudit(env, {
      actor: fakeActor(),
      action: "settings.updated",
      entity: { type: "settings", id: "stripe" },
      previousData: { stripeSecretKey: "sk_live_old" },
      newData: { stripeSecretKey: "sk_live_new" },
      metadata: { webhookSecret: "whsec_123" },
      requestId: "req_1"
    });

    const args = statements[0]!.args;
    const serialized = JSON.stringify(args);
    expect(serialized).not.toContain("sk_live_old");
    expect(serialized).not.toContain("sk_live_new");
    expect(serialized).not.toContain("whsec_123");
    expect(serialized).toContain("[REDACTED]");
  });

  it("never swallows a D1 failure - a caller that awaits this sees the rejection", async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ run: vi.fn(() => Promise.reject(new Error("D1 unavailable"))) }))
      }))
    };
    const env = { DB: db } as unknown as Env;

    await expect(
      recordAudit(env, { actor: fakeActor(), action: "product.updated", entity: { type: "product", id: "prd_1" }, requestId: "req_1" })
    ).rejects.toThrow("D1 unavailable");
  });

  it("exposes only record() - there is no update or delete export, matching the append-only contract", () => {
    expect(Object.keys(auditService)).toEqual(["record"]);
  });
});
