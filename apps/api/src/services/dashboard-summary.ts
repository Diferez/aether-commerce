import type { Env } from "../types";

export type DashboardSummary = {
  revenue: number;
  orders: number;
  conversionRate: null;
  lowStock: number;
};

// Revenue/order counts are real, derived from the orders table - only
// payment states that actually collected money count, so a cancelled or
// still-pending order never inflates the figure. conversionRate is always
// null: nothing in this codebase records storefront pageviews/sessions, so
// there is no real numerator/denominator to compute it from. It used to be
// a fixed placeholder (4.8) shown as if it were real - null instead, so
// every caller (the real admin dashboard and the admin-chat tools) can
// render "not available" instead of a fabricated number the store owner
// could mistake for a real metric.
export async function computeDashboardSummary(env: Env): Promise<DashboardSummary> {
  const [revenueRow, lowStockRow] = await Promise.all([
    env.DB.prepare(
      "select coalesce(sum(total), 0) as revenue, count(*) as orders from orders where payment_status in ('paid', 'partially_refunded', 'refunded')"
    ).first<{ revenue: number; orders: number }>(),
    env.DB.prepare("select count(*) as count from products where stock > 0 and stock <= low_stock_threshold").first<{ count: number }>()
  ]);

  return {
    revenue: revenueRow?.revenue ?? 0,
    orders: revenueRow?.orders ?? 0,
    conversionRate: null,
    lowStock: lowStockRow?.count ?? 0
  };
}
