import type { StatusTone } from "../StatusBadge";

// Same formatting/tone conventions as app/products/page.tsx and
// app/orders/page.tsx, kept local here so chat result cards read identically
// to the pages they link out to.
export function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export const visibilityTone: Record<"draft" | "visible" | "hidden", StatusTone> = {
  visible: "success",
  draft: "pending",
  hidden: "archived"
};

export const fulfillmentTone: Record<string, StatusTone> = {
  unfulfilled: "neutral",
  processing: "in-process",
  shipped: "info",
  delivered: "success",
  cancelled: "error"
};

export const customerStatusTone: Record<"active" | "suspended", StatusTone> = {
  active: "success",
  suspended: "error"
};

export const healthLevelTone: Record<string, StatusTone> = {
  operational: "success",
  degraded: "warning",
  critical: "error",
  unknown: "neutral"
};

// dashboard_summary is shared by get_dashboard_summary (revenue, orders,
// lowStock, ...) and get_system_health (errors24h, avgLatencyMs, ...) - one
// label/format table covers both instead of each tool inventing its own
// display convention. "status" is excluded here since ToolResultCard renders
// it as a badge, not a grid cell.
const STAT_FIELD_META: Record<string, { label: string; format?: (value: number | string | null) => string }> = {
  errors24h: { label: "Errors (24h)" },
  webhooksFailed24h: { label: "Webhooks failed (24h)" },
  paymentsFailed24h: { label: "Payments failed (24h)" },
  adminFailedAttempts1h: { label: "Failed admin attempts (1h)" },
  negativeInventoryCount: { label: "Negative inventory" },
  blockedOrdersCount: { label: "Blocked orders" },
  avgLatencyMs: { label: "Avg. latency", format: (v) => (typeof v === "number" ? `${Math.round(v)}ms` : "No data") },
  lastCriticalTask: { label: "Last critical task" },
  revenue: { label: "Revenue", format: (v) => (typeof v === "number" ? money(v) : String(v ?? "-")) },
  orders: { label: "Orders" },
  averageTicket: { label: "Avg. ticket", format: (v) => (typeof v === "number" ? money(v) : String(v ?? "-")) },
  conversionRate: { label: "Conversion rate", format: (v) => (typeof v === "number" ? `${v}%` : String(v ?? "-")) },
  lowStock: { label: "Low stock" },
  outOfStock: { label: "Out of stock" },
  pendingOrders: { label: "Pending orders" }
};

// Falls back to a humanized version of the raw key for any stat this table
// doesn't know about yet, so a new dashboard_summary field never regresses
// to a bare camelCase label.
function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function statFieldLabel(key: string): string {
  return STAT_FIELD_META[key]?.label ?? humanizeKey(key);
}

export function formatStatValue(key: string, value: number | string | null): string {
  const format = STAT_FIELD_META[key]?.format;
  if (format) return format(value);
  return value === null ? "-" : String(value);
}
