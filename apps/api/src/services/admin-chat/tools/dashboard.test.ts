import { describe, expect, it } from "vitest";
import { getDashboardSummaryTool, getRecentActivityTool, getSalesSummaryTool, getStoreAlertsTool } from "./dashboard";
import { fakeContext, fakeEnv } from "../test-support";

describe("getDashboardSummaryTool", () => {
  it("computes real revenue/order figures from the orders table, plus a real live low-stock count", async () => {
    const { env, db } = fakeEnv([{ first: { revenue: 543200, orders: 12 } }, { first: { count: 7 } }]);
    const ctx = fakeContext(env);

    const result = await getDashboardSummaryTool.run({}, ctx);

    expect(result.artifact).toMatchObject({
      type: "dashboard_summary",
      summary: { revenue: 543200, orders: 12, conversionRate: null, lowStock: 7 }
    });
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });

  it("defaults revenue/orders/low-stock to zero when their queries return nothing", async () => {
    const { env } = fakeEnv([{ first: null }, { first: null }]);
    const ctx = fakeContext(env);

    const result = await getDashboardSummaryTool.run({}, ctx);

    expect(result.artifact).toMatchObject({ type: "dashboard_summary", summary: { revenue: 0, orders: 0, lowStock: 0 } });
  });
});

describe("getSalesSummaryTool", () => {
  it("returns the same real revenue/order figures computeDashboardSummary produces", async () => {
    const { env, db } = fakeEnv([{ first: { revenue: 543200, orders: 12 } }, { first: { count: 0 } }]);
    const ctx = fakeContext(env);

    const result = await getSalesSummaryTool.run({}, ctx);

    expect(result.artifact).toEqual({ type: "dashboard_summary", summary: { revenue: 543200, orders: 12, conversionRate: null, lowStock: 0 } });
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });
});

describe("getStoreAlertsTool", () => {
  it("returns three real, live counts run in parallel", async () => {
    const { env, db } = fakeEnv([{ first: { count: 3 } }, { first: { count: 1 } }, { first: { count: 5 } }]);
    const ctx = fakeContext(env);

    const result = await getStoreAlertsTool.run({}, ctx);

    expect(result.artifact).toEqual({ type: "dashboard_summary", summary: { lowStock: 3, outOfStock: 1, pendingOrders: 5 } });
    expect(db.prepare).toHaveBeenCalledTimes(3);
  });
});

describe("getRecentActivityTool", () => {
  it("maps audit_logs rows to activity items, most recent first", async () => {
    const { env } = fakeEnv([
      {
        all: [
          { id: "log_2", actor_id: "usr_admin", actor_role: "admin", action: "product.updated", target_type: "product", target_id: "prd_1", created_at: "2026-08-15T10:00:00Z" },
          { id: "log_1", actor_id: "usr_admin", actor_role: null, action: "order.status_changed", target_type: "order", target_id: "ord_1", created_at: "2026-08-15T09:00:00Z" }
        ]
      }
    ]);
    const ctx = fakeContext(env);

    const result = await getRecentActivityTool.run({ limit: 20 }, ctx);

    expect(result.artifact).toEqual({
      type: "activity_list",
      items: [
        { id: "log_2", action: "product.updated", targetType: "product", targetId: "prd_1", actorId: "usr_admin", actorRole: "admin", createdAt: "2026-08-15T10:00:00Z" },
        { id: "log_1", action: "order.status_changed", targetType: "order", targetId: "ord_1", actorId: "usr_admin", actorRole: null, createdAt: "2026-08-15T09:00:00Z" }
      ]
    });
  });

  it("reports no recent activity instead of an empty list with no context", async () => {
    const { env } = fakeEnv([{ all: [] }]);
    const ctx = fakeContext(env);

    const result = await getRecentActivityTool.run({ limit: 20 }, ctx);

    expect(result.artifact).toEqual({ type: "activity_list", items: [] });
    expect(result.message).toMatch(/no recent activity/i);
  });

  it("builds the caption in Spanish when the operator's conversation is in Spanish, not just the card below it", async () => {
    const { env } = fakeEnv([{ all: [{ id: "log_1", actor_id: "usr_admin", actor_role: null, action: "settings.updated", target_type: "settings", target_id: "checkout", created_at: "2026-08-16T17:35:37Z" }] }]);
    const ctx = fakeContext(env, {}, { language: "es" });

    const result = await getRecentActivityTool.run({ limit: 20 }, ctx);

    expect(result.message).toBe("1 cambio(s) reciente(s), el más reciente primero.");
    expect(result.message).not.toMatch(/recent change/i);
  });
});
