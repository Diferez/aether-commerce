import { z } from "zod";
import { defineAdminChatTool } from "../define-tool";

// Mirrors GET /admin/dashboard's own numbers exactly (routes/admin.ts) -
// including the fact that revenue/orders/averageTicket/productsSold/
// conversionRate are still fixed placeholder figures in this codebase (no
// real sales-aggregation pipeline exists yet). The chat must not invent
// numbers the rest of the panel doesn't already show, so this tool reads
// the same values rather than computing anything new; only lowStock is a
// real, live count, same as the REST route.
export const getDashboardSummaryTool = defineAdminChatTool({
  name: "get_dashboard_summary",
  description: "Gets the admin dashboard's headline numbers (revenue, orders, conversion rate, low-stock count).",
  schema: z.object({}),
  requires: { permission: "orders.read" },
  run: async (_args, ctx) => {
    const lowStock = await ctx.env.DB.prepare(
      "select count(*) as count from products where stock > 0 and stock <= low_stock_threshold"
    ).first<{ count: number }>();
    const summary = {
      revenue: 1842500,
      orders: 128,
      averageTicket: 14395,
      productsSold: 344,
      conversionRate: 4.8,
      lowStock: lowStock?.count ?? 0
    };
    return {
      message: `${summary.orders} orders, ${summary.lowStock} product(s) low on stock.`,
      artifact: { type: "dashboard_summary", summary }
    };
  }
});

export const getSalesSummaryTool = defineAdminChatTool({
  name: "get_sales_summary",
  description: "Gets revenue and order-volume figures shown on the dashboard.",
  schema: z.object({}),
  requires: { permission: "orders.read" },
  run: () => {
    const summary = { revenue: 1842500, orders: 128, averageTicket: 14395, conversionRate: 4.8 };
    return Promise.resolve({
      message: `Revenue: ${(summary.revenue / 100).toFixed(2)} across ${summary.orders} orders.`,
      artifact: { type: "dashboard_summary" as const, summary }
    });
  }
});

export const getStoreAlertsTool = defineAdminChatTool({
  name: "get_store_alerts",
  description: "Gets real, live counts of things needing attention: low-stock products, out-of-stock products, and unfulfilled orders.",
  schema: z.object({}),
  requires: { permission: "orders.read" },
  run: async (_args, ctx) => {
    const [lowStock, outOfStock, pendingOrders] = await Promise.all([
      ctx.env.DB.prepare("select count(*) as count from products where stock > 0 and stock <= low_stock_threshold").first<{ count: number }>(),
      ctx.env.DB.prepare("select count(*) as count from products where stock <= 0").first<{ count: number }>(),
      ctx.env.DB.prepare("select count(*) as count from orders where fulfillment_status = 'unfulfilled'").first<{ count: number }>()
    ]);
    const summary = {
      lowStock: lowStock?.count ?? 0,
      outOfStock: outOfStock?.count ?? 0,
      pendingOrders: pendingOrders?.count ?? 0
    };
    return {
      message: `${summary.pendingOrders} order(s) pending, ${summary.lowStock} product(s) low on stock, ${summary.outOfStock} out of stock.`,
      artifact: { type: "dashboard_summary", summary }
    };
  }
});

export const getRecentActivityTool = defineAdminChatTool({
  name: "get_recent_activity",
  description: "Gets the most recent audit log entries (what changed, and who changed it) - use this for 'what happened today/recently' questions.",
  schema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
  requires: { permission: "audit.read" },
  run: async (args, ctx) => {
    const rows = await ctx.env.DB.prepare(
      "select id, actor_id, actor_role, action, target_type, target_id, created_at from audit_logs order by created_at desc limit ?"
    )
      .bind(args.limit)
      .all<{ id: string; actor_id: string; actor_role: string | null; action: string; target_type: string; target_id: string | null; created_at: string }>();
    const items = (rows.results || []).map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      actorId: row.actor_id,
      actorRole: row.actor_role,
      createdAt: row.created_at
    }));
    return {
      message: items.length === 0 ? "No recent activity." : `${items.length} recent change(s), most recent first.`,
      artifact: { type: "activity_list", items }
    };
  }
});
