import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { writeAuditLog } from "./audit";

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
