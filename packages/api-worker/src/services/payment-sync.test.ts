import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { syncChargeRefunded, syncDisputeCreated } from "./payment-sync";

type Row = Record<string, unknown> | null;

function fakeDb(rows: { payment?: Row; order?: Row } = {}) {
  const run = vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } }));
  const batch = vi.fn((stmts: unknown[]) => Promise.resolve(stmts.map(() => ({ success: true, meta: { changes: 1 } }))));
  const statements: string[] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      statements.push(sql);
      return {
        run,
        bind: vi.fn(() => ({
          first: vi.fn(() => {
            if (sql.includes("from payments")) return Promise.resolve(rows.payment ?? null);
            if (sql.includes("from orders")) return Promise.resolve(rows.order ?? null);
            return Promise.resolve(null);
          }),
          all: vi.fn(() => Promise.resolve({ results: [] })),
          run
        })),
        first: vi.fn(() => Promise.resolve(null))
      };
    }),
    batch
  };
  return { env: { DB: db, CONTACT_RECIPIENT_EMAIL: "owner@example.com" } as unknown as Env, db, statements, batch };
}

describe("syncChargeRefunded", () => {
  it("does nothing when the charge has no payment_intent to look up", async () => {
    const { env, batch } = fakeDb();

    await syncChargeRefunded(env, { id: "ch_1" }, "req_1");

    expect(batch).not.toHaveBeenCalled();
  });

  it("does nothing when no Aether order matches the payment intent - not this store's charge", async () => {
    const { env, batch } = fakeDb({ payment: null });

    await syncChargeRefunded(env, { id: "ch_1", payment_intent: "pi_unknown" }, "req_1");

    expect(batch).not.toHaveBeenCalled();
  });

  it("is a no-op when the order is already refunded - avoids double-applying a refund Aether itself already made", async () => {
    const { env, batch } = fakeDb({
      payment: { order_id: "ord_1" },
      order: { channel: "stripe", payment_status: "refunded", total: 5000, stock_restored_at: "2026-01-01T00:00:00.000Z", email: "shopper@example.com", number: "AETH-1" }
    });

    await syncChargeRefunded(env, { id: "ch_1", payment_intent: "pi_1", refunded: true, amount_refunded: 5000 }, "req_1");

    expect(batch).not.toHaveBeenCalled();
  });

  it("applies a full refund found via a still-paid order", async () => {
    const { env, batch } = fakeDb({
      payment: { order_id: "ord_1" },
      order: { channel: "stripe", payment_status: "paid", total: 5000, stock_restored_at: null, email: "shopper@example.com", number: "AETH-1" }
    });

    await syncChargeRefunded(env, { id: "ch_1", payment_intent: "pi_1", refunded: true, amount_refunded: 5000 }, "req_1");

    expect(batch).toHaveBeenCalledTimes(1);
  });
});

describe("syncDisputeCreated", () => {
  it("writes an audit log entry and emails the owner even when no matching order is found", async () => {
    const { env, statements } = fakeDb({ payment: null });

    await syncDisputeCreated(env, { id: "dp_1", payment_intent: "pi_missing", reason: "fraudulent" }, "req_1");

    expect(statements.some((sql) => sql.includes("insert into audit_logs"))).toBe(true);
  });

  it("includes the order number when the dispute's payment intent matches a known order", async () => {
    const { env, statements } = fakeDb({
      payment: { order_id: "ord_1" },
      order: { number: "AETH-1" }
    });

    await syncDisputeCreated(env, { id: "dp_1", payment_intent: "pi_1", reason: "fraudulent", status: "needs_response" }, "req_1");

    expect(statements.some((sql) => sql.includes("insert into audit_logs"))).toBe(true);
    expect(statements.some((sql) => sql.includes("from orders"))).toBe(true);
  });
});
