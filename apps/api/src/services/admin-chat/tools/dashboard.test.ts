import { describe, expect, it } from "vitest";
import { getDashboardSummaryTool, getRecentActivityTool, getSalesSummaryTool, getStoreAlertsTool } from "./dashboard";
import { fakeContext, fakeEnv } from "../test-support";

describe("getDashboardSummaryTool", () => {
  it("mirrors the placeholder headline figures the rest of the admin panel shows, plus a real live low-stock count", async () => {
    const { env, db } = fakeEnv([{ first: { count: 7 } }]);
    const ctx = fakeContext(env);

    const result = await getDashboardSummaryTool.run({}, ctx);

    expect(result.artifact).toMatchObject({
      type: "dashboard_summary",
      summary: { revenue: 1842500, orders: 128, averageTicket: 14395, productsSold: 344, conversionRate: 4.8, lowStock: 7 }
    });
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it("defaults the low-stock count to zero when the query returns nothing", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const result = await getDashboardSummaryTool.run({}, ctx);

    expect(result.artifact).toMatchObject({ type: "dashboard_summary", summary: { lowStock: 0 } });
  });
});

describe("getSalesSummaryTool", () => {
  it("returns the same fixed revenue/order figures without touching the database", async () => {
    const { env, db } = fakeEnv();
    const ctx = fakeContext(env);

    const result = await getSalesSummaryTool.run({}, ctx);

    expect(result.artifact).toEqual({ type: "dashboard_summary", summary: { revenue: 1842500, orders: 128, averageTicket: 14395, conversionRate: 4.8 } });
    expect(db.prepare).not.toHaveBeenCalled();
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
});
