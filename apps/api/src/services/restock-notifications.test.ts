import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { sendDueRestockNotifications, subscribeToRestockNotification } from "./restock-notifications";

// A generic bind-aware D1 mock, keyed by matching SQL text - resend/send()'s
// own bind-less integration-settings lookup (RESEND_API_KEY missing in
// every test here, so send() never actually reaches fetch) always resolves
// "no row", same convention used by this session's other D1 mocks.
function fakeDb(responses: { productExists?: boolean; pending?: { id: string; email: string; product_id: string; name: string; slug: string }[] } = {}) {
  const run = vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } }));
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const bind = vi.fn((...args: unknown[]) => {
        statements.push({ sql, args });
        return {
          first: vi.fn(() => Promise.resolve(sql.includes("select id from products") ? (responses.productExists === false ? null : { id: "prd_1" }) : null)),
          all: vi.fn(() => Promise.resolve({ results: [] })),
          run
        };
      });
      return {
        bind,
        first: vi.fn(() => Promise.resolve(null)),
        all: vi.fn(() => Promise.resolve({ results: sql.includes("restock_notifications") ? responses.pending ?? [] : [] })),
        run
      };
    })
  };
  return { env: { DB: db, APP_ORIGIN_STORE: "https://store.example.test" } as unknown as Env, db, statements, run };
}

describe("subscribeToRestockNotification", () => {
  it("returns product_not_found for an unknown product without inserting a subscription", async () => {
    const { env } = fakeDb({ productExists: false });

    const result = await subscribeToRestockNotification(env, "prd_missing", "shopper@example.com");

    expect(result).toEqual({ ok: false, error: "product_not_found" });
  });

  it("inserts a subscription (idempotent via ON CONFLICT DO NOTHING) for a real product", async () => {
    const { env, statements } = fakeDb({ productExists: true });

    const result = await subscribeToRestockNotification(env, "prd_1", "shopper@example.com");

    expect(result).toEqual({ ok: true });
    const insert = statements.find((s) => s.sql.includes("insert into restock_notifications"));
    expect(insert?.sql).toContain("on conflict(product_id, email) do nothing");
    expect(insert?.args).toEqual(expect.arrayContaining(["prd_1", "shopper@example.com"]));
  });
});

describe("sendDueRestockNotifications", () => {
  it("does nothing when there are no pending, now-in-stock notifications", async () => {
    const { env } = fakeDb({ pending: [] });

    const result = await sendDueRestockNotifications(env);

    expect(result).toEqual({ sent: 0 });
  });

  it("marks each pending notification as notified after emailing it", async () => {
    const { env, statements } = fakeDb({
      pending: [{ id: "rn_1", email: "shopper@example.com", product_id: "prd_1", name: "Wireless Mouse", slug: "wireless-mouse" }]
    });

    const result = await sendDueRestockNotifications(env);

    expect(result).toEqual({ sent: 1 });
    const update = statements.find((s) => s.sql.includes("update restock_notifications set notified_at"));
    expect(update?.args).toEqual(["rn_1"]);
  });
});
