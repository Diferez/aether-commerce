import type { StatusTone } from "../StatusBadge";
import type { AdminDictionary } from "@aether/i18n";

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
function getStatFieldMeta(t: AdminDictionary): Record<string, { label: string; format?: (value: number | string | null) => string }> {
  return {
    errors24h: { label: t.chat.statErrors24h },
    webhooksFailed24h: { label: t.chat.statWebhooksFailed24h },
    paymentsFailed24h: { label: t.chat.statPaymentsFailed24h },
    adminFailedAttempts1h: { label: t.chat.statFailedAdminAttempts1h },
    negativeInventoryCount: { label: t.chat.statNegativeInventory },
    blockedOrdersCount: { label: t.chat.statBlockedOrders },
    avgLatencyMs: { label: t.chat.statAvgLatency, format: (v) => (typeof v === "number" ? `${Math.round(v)}ms` : t.chat.statNoData) },
    lastCriticalTask: { label: t.chat.statLastCriticalTask },
    revenue: { label: t.chat.statRevenue, format: (v) => (typeof v === "number" ? money(v) : String(v ?? "-")) },
    orders: { label: t.chat.statOrders },
    averageTicket: { label: t.chat.statAverageTicket, format: (v) => (typeof v === "number" ? money(v) : String(v ?? "-")) },
    conversionRate: { label: t.chat.statConversionRate, format: (v) => (typeof v === "number" ? `${v}%` : String(v ?? "-")) },
    lowStock: { label: t.chat.statLowStock },
    outOfStock: { label: t.chat.statOutOfStock },
    pendingOrders: { label: t.chat.statPendingOrders }
  };
}

// Falls back to a humanized version of the raw key for any stat this table
// doesn't know about yet, so a new dashboard_summary field never regresses
// to a bare camelCase label.
function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function statFieldLabel(t: AdminDictionary, key: string): string {
  return getStatFieldMeta(t)[key]?.label ?? humanizeKey(key);
}

export function formatStatValue(t: AdminDictionary, key: string, value: number | string | null): string {
  const format = getStatFieldMeta(t)[key]?.format;
  if (format) return format(value);
  return value === null ? "-" : String(value);
}
