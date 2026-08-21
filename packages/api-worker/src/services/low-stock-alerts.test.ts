import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { sendLowStockAlerts } from "./low-stock-alerts";

function fakeDb(lowStockRows: { id: string; name: string; stock: number }[] = []) {
  const run = vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } }));
  const batch = vi.fn((stmts: unknown[]) => Promise.resolve(stmts.map(() => ({ success: true, meta: { changes: 1 } }))));
  const statements: string[] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      statements.push(sql);
      return {
        run,
        bind: vi.fn(() => ({ run })),
        // Bind-less select for the low-stock query; the reset UPDATE above
        // it also runs bind-less via .run() directly on this same object.
        all: vi.fn(() => Promise.resolve({ results: sql.includes("select id, name, stock") ? lowStockRows : [] }))
      };
    }),
    batch
  };
  return { env: { DB: db, CONTACT_RECIPIENT_EMAIL: "owner@example.com" } as unknown as Env, db, statements, run, batch };
}

describe("sendLowStockAlerts", () => {
  it("does nothing (no batch write) when nothing is newly low on stock", async () => {
    const { env, batch } = fakeDb([]);

    const result = await sendLowStockAlerts(env);

    expect(result).toEqual({ alerted: 0 });
    expect(batch).not.toHaveBeenCalled();
  });

  it("marks every newly-low product as alerted after emailing the owner once", async () => {
    const { env, batch } = fakeDb([
      { id: "prd_1", name: "Wireless Mouse", stock: 2 },
      { id: "prd_2", name: "Keyboard", stock: 0 }
    ]);

    const result = await sendLowStockAlerts(env);

    expect(result).toEqual({ alerted: 2 });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("always resets stale alert flags for restocked products before checking what's newly low", async () => {
    const { env, statements } = fakeDb([]);

    await sendLowStockAlerts(env);

    expect(statements.some((sql) => sql.includes("low_stock_alerted_at = null") && sql.includes("stock > low_stock_threshold"))).toBe(true);
  });
});
