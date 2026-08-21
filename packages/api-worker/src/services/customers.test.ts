import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { getCustomerDetail, listCustomersForAdmin, setCustomerRole, setCustomerStatus } from "./customers";

vi.mock("./clerk", () => ({
  updateUserRole: vi.fn()
}));

type QueuedResponse = { first?: unknown; all?: unknown[] };

function fakeEnv(responses: QueuedResponse[] = []) {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  let callIndex = 0;
  const db = {
    prepare: vi.fn((sql: string) => {
      const response = responses[callIndex] ?? {};
      callIndex += 1;
      return {
        bind: vi.fn((...args: unknown[]) => {
          statements.push({ sql, args });
          return {
            sql,
            args,
            first: vi.fn(() => Promise.resolve(response.first ?? null)),
            all: vi.fn(() => Promise.resolve({ results: response.all ?? [] })),
            run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } }))
          };
        })
      };
    }),
    batch: vi.fn((stmts: unknown[]) => Promise.resolve(stmts.map(() => ({ success: true }))))
  };
  return { env: { DB: db } as unknown as Env, db, statements };
}

describe("listCustomersForAdmin", () => {
  it("merges roster rows with per-email order aggregates, defaulting to zero when no orders match", async () => {
    const { env } = fakeEnv([
      { first: { count: 2 } },
      {
        all: [
          {
            id: "usr_1",
            name: "Ana",
            email: "ana@example.com",
            roles_json: '["customer"]',
            status: "active",
            created_at: "2026-01-01",
            source: "registered"
          },
          {
            id: "guest:bob@example.com",
            name: null,
            email: "bob@example.com",
            roles_json: '["customer"]',
            status: "active",
            created_at: "2026-01-02",
            source: "guest"
          }
        ]
      },
      { all: [{ email_key: "ana@example.com", order_count: 3, total_spent: 9000, last_order_at: "2026-02-01" }] }
    ]);

    const result = await listCustomersForAdmin(env, { page: 1, pageSize: 25 });

    expect(result.pagination).toEqual({ page: 1, pageSize: 25, total: 2, pageCount: 1 });
    expect(result.data[0]).toMatchObject({ id: "usr_1", source: "registered", orderCount: 3, totalSpent: 9000 });
    expect(result.data[1]).toMatchObject({ id: "guest:bob@example.com", source: "guest", orderCount: 0, totalSpent: 0 });
  });

  it("skips the order-aggregate query entirely when the roster page is empty", async () => {
    const { env, db } = fakeEnv([{ first: { count: 0 } }, { all: [] }]);
    const result = await listCustomersForAdmin(env, { page: 1, pageSize: 25 });
    expect(result.data).toEqual([]);
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });
});

describe("getCustomerDetail", () => {
  it("returns null for a guest id with no matching orders", async () => {
    const { env } = fakeEnv([{ all: [] }]);
    expect(await getCustomerDetail(env, "guest:nobody@example.com")).toBeNull();
  });

  it("builds a guest detail with the current payment and fulfillment columns", async () => {
    const { env } = fakeEnv([
      {
        all: [
          {
            payload_json: JSON.stringify({ id: "ord_shipped", paymentStatus: "pending" }),
            state: "paid",
            channel: "stripe",
            payment_status: "paid",
            fulfillment_status: "shipped",
            tracking_carrier: null,
            tracking_number: null,
            tracking_url: null
          },
          {
            payload_json: JSON.stringify({ id: "ord_processing" }),
            state: "paid",
            channel: "stripe",
            payment_status: "paid",
            fulfillment_status: "processing",
            tracking_carrier: null,
            tracking_number: null,
            tracking_url: null
          }
        ]
      }
    ]);
    const detail = await getCustomerDetail(env, "guest:bob@example.com");
    expect(detail).toMatchObject({ source: "guest", email: "bob@example.com", addresses: [] });
    expect(detail?.orders).toEqual([
      expect.objectContaining({ id: "ord_shipped", paymentStatus: "paid", fulfillmentStatus: "shipped" }),
      expect.objectContaining({ id: "ord_processing", paymentStatus: "paid", fulfillmentStatus: "processing" })
    ]);
  });

  it("returns null for a real id that has no users row", async () => {
    const { env } = fakeEnv([{ first: null }]);
    expect(await getCustomerDetail(env, "usr_missing")).toBeNull();
  });

  it("merges the user row with addresses and orders for a real id", async () => {
    const { env } = fakeEnv([
      { first: { id: "usr_1", name: "Ana", email: "ana@example.com", roles_json: '["admin"]', status: "active", created_at: "2026-01-01" } },
      { all: [{ payload_json: JSON.stringify({ label: "Home" }) }] },
      {
        all: [
          {
            payload_json: JSON.stringify({ id: "ord_1", fulfillmentStatus: "unfulfilled" }),
            state: "paid",
            channel: "stripe",
            payment_status: "paid",
            fulfillment_status: "processing",
            tracking_carrier: null,
            tracking_number: null,
            tracking_url: null
          }
        ]
      }
    ]);
    const detail = await getCustomerDetail(env, "usr_1");
    expect(detail).toMatchObject({ source: "registered", roles: ["admin"], status: "active" });
    expect(detail?.addresses).toHaveLength(1);
    expect(detail?.orders).toEqual([expect.objectContaining({ id: "ord_1", paymentStatus: "paid", fulfillmentStatus: "processing" })]);
  });
});

describe("setCustomerStatus", () => {
  it("rejects a guest id without touching the database", async () => {
    const { env, db } = fakeEnv();
    const result = await setCustomerStatus(env, "guest:bob@example.com", "suspended", { actorId: "usr_admin", requestId: "req_1" });
    expect(result).toEqual({ updated: false, error: "guest_account" });
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("returns not_found when the user row doesn't exist", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const result = await setCustomerStatus(env, "usr_missing", "suspended", { actorId: "usr_admin", requestId: "req_1" });
    expect(result).toEqual({ updated: false, error: "not_found" });
  });

  it("is a no-op that skips the audit write when the status is already what was requested", async () => {
    const { env, db } = fakeEnv([{ first: { status: "active" } }]);
    const result = await setCustomerStatus(env, "usr_1", "active", { actorId: "usr_admin", requestId: "req_1" });
    expect(result).toEqual({ updated: true });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("suspends the user and records an audit_logs entry", async () => {
    const { env, db } = fakeEnv([{ first: { status: "active" } }]);
    const result = await setCustomerStatus(env, "usr_1", "suspended", { actorId: "usr_admin", requestId: "req_1" });
    expect(result).toEqual({ updated: true });
    expect(db.batch).toHaveBeenCalledTimes(1);
    const batchedSql = (db.batch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Array<{ sql: string; args: unknown[] }>;
    expect(batchedSql[0]!.sql).toContain("update users set status");
    expect(batchedSql[1]!.sql).toContain("user.status_changed");
    expect(batchedSql[1]!.args).toContain("usr_admin");
  });
});

describe("setCustomerRole", () => {
  it("rejects a guest id without calling Clerk", async () => {
    const { updateUserRole } = await import("./clerk");
    const { env } = fakeEnv();
    const result = await setCustomerRole(env, "guest:bob@example.com", "admin", { actorId: "usr_admin", requestId: "req_1" });
    expect(result).toEqual({ updated: false, error: "guest_account" });
    expect(updateUserRole).not.toHaveBeenCalled();
  });

  it("returns not_found when the user row doesn't exist", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const result = await setCustomerRole(env, "usr_missing", "admin", { actorId: "usr_admin", requestId: "req_1" });
    expect(result).toEqual({ updated: false, error: "not_found" });
  });

  it("does not write D1 when the Clerk call fails", async () => {
    const { updateUserRole } = await import("./clerk");
    vi.mocked(updateUserRole).mockResolvedValueOnce({ ok: false, status: 422 });
    const { env, db } = fakeEnv([{ first: { roles_json: '["customer"]' } }]);
    const result = await setCustomerRole(env, "usr_1", "admin", { actorId: "usr_admin", requestId: "req_1" });
    expect(result).toEqual({ updated: false, error: "clerk_update_failed" });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("updates D1 and records an audit_logs entry once Clerk confirms the change", async () => {
    const { updateUserRole } = await import("./clerk");
    vi.mocked(updateUserRole).mockResolvedValueOnce({ ok: true });
    const { env, db } = fakeEnv([{ first: { roles_json: '["customer"]' } }]);
    const result = await setCustomerRole(env, "usr_1", "admin", { actorId: "usr_admin", requestId: "req_1" });
    expect(result).toEqual({ updated: true });
    expect(db.batch).toHaveBeenCalledTimes(1);
    const batchedSql = (db.batch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Array<{ sql: string; args: unknown[] }>;
    expect(batchedSql[0]!.sql).toContain("update users set roles_json");
    expect(batchedSql[1]!.sql).toContain("user.role_changed");
  });
});
