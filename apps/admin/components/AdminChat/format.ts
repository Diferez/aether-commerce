import type { StatusTone } from "../StatusBadge";
import type { AdminDictionary } from "@aether/i18n";
import type { ActivityItemArtifact } from "./types";

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

// PendingActionCard's diff.fields and ReceiptCard's result entries both key
// off whatever camelCase field name a tool used internally (orderId,
// fulfillmentStatus, priceCents, ...) - readable to the engineer who wrote
// the tool, not to the operator confirming or reading the outcome of a
// mutation. Same fallback shape as statFieldLabel: a known key gets a real
// translated label, anything else still reads as spaced-out words instead
// of bare camelCase.
function getFieldLabelMeta(t: AdminDictionary): Record<string, string> {
  return {
    orderId: t.chat.fieldOrderId,
    productId: t.chat.fieldProductId,
    previousFulfillmentStatus: t.chat.fieldPreviousFulfillmentStatus,
    fulfillmentStatus: t.chat.fieldFulfillmentStatus,
    name: t.chat.fieldName,
    sku: t.chat.fieldSku,
    category: t.chat.fieldCategory,
    percent: t.chat.fieldPercent,
    changed: t.chat.fieldChanged,
    visibility: t.chat.fieldVisibility,
    priceCents: t.chat.fieldPriceCents,
    stock: t.chat.fieldStock
  };
}

export function fieldLabel(t: AdminDictionary, key: string): string {
  return getFieldLabelMeta(t)[key] ?? humanizeKey(key);
}

// get_recent_activity (the "what happened today" tool) reads straight off
// audit_logs, whose `action` is a dotted event code meant for engineers
// (e.g. "order.fulfillment_changed") and whose `target_id` is often an
// opaque internal id (a Stripe checkout session id, a Clerk user id) - fine
// in the full Activity page's table (a technical audit trail with a raw
// JSON toggle) but meaningless noise in Aether Chat, which the store owner
// themself reads. This table translates the known codes into a plain
// sentence; an action added later without an entry here still falls back to
// a humanized (not raw-dotted) label instead of regressing to jargon.
const SETTINGS_SECTION_LABEL_KEYS = {
  checkout: "activitySettingsSectionCheckout",
  brand: "activitySettingsSectionBrand",
  shipping: "activitySettingsSectionShipping",
  reservations: "activitySettingsSectionReservations"
} as const satisfies Record<string, keyof AdminDictionary["chat"]>;

function getActivityActionLabels(t: AdminDictionary): Record<string, string> {
  return {
    "order.created": t.chat.activityActionOrderCreated,
    "order.updated": t.chat.activityActionOrderUpdated,
    "order.status_changed": t.chat.activityActionOrderStatusChanged,
    "order.fulfillment_changed": t.chat.activityActionOrderFulfillmentChanged,
    "order.refunded": t.chat.activityActionOrderRefunded,
    "product.created": t.chat.activityActionProductCreated,
    "product.updated": t.chat.activityActionProductUpdated,
    "product.deleted": t.chat.activityActionProductDeleted,
    "product.price_changed": t.chat.activityActionProductPriceChanged,
    "product.visibility_changed": t.chat.activityActionProductVisibilityChanged,
    "product.bulk_price_adjusted": t.chat.activityActionProductBulkPriceAdjusted,
    "product.bulk_visibility_changed": t.chat.activityActionProductBulkVisibilityChanged,
    "coupon.created": t.chat.activityActionCouponCreated,
    "coupon.updated": t.chat.activityActionCouponUpdated,
    "coupon.deactivated": t.chat.activityActionCouponDeactivated,
    "user.status_changed": t.chat.activityActionUserStatusChanged,
    "user.role_changed": t.chat.activityActionUserRoleChanged
  };
}

// Same "subject verb" fallback as the full Activity page's own
// humanizeAction, kept independent (not imported - that page lives in
// apps/admin/app, this in apps/admin/components, and the two only share this
// one small function) so an action neither table knows about yet still reads
// as words, e.g. "auth.login_failed" -> "Auth login failed".
function humanizeActionCode(action: string): string {
  const [subject, ...rest] = action.split(".");
  const verb = rest.join(" ").replaceAll("_", " ");
  const label = `${subject} ${verb}`.trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function activityActionLabel(t: AdminDictionary, item: Pick<ActivityItemArtifact, "action" | "targetId">): string {
  if (item.action === "settings.updated") {
    const sectionKey = item.targetId ? SETTINGS_SECTION_LABEL_KEYS[item.targetId as keyof typeof SETTINGS_SECTION_LABEL_KEYS] : undefined;
    const section = sectionKey ? t.chat[sectionKey] : (item.targetId ?? "");
    return t.chat.activityActionSettingsUpdated.replace("{section}", section);
  }
  return getActivityActionLabels(t)[item.action] ?? humanizeActionCode(item.action);
}

// Non-human actors that show up in audit_logs.actor_id as a literal instead
// of a Clerk user id (see orders.ts's stock-decrement calls, which pass the
// payment provider name as actorId for a webhook-driven change).
const AUTOMATIC_ACTOR_IDS = new Set(["stripe", "clerk", "webhook", "system"]);

// A raw Clerk user id ("user_3H4gZ...") tells a store owner nothing and
// most audit_logs rows never recorded a role in the first place (only the
// newer recordAudit path does - see audit.ts) - so this only ever surfaces
// a "by {role}" clause when one was actually recorded, or names a known
// automated actor; otherwise it returns null and the row simply omits who,
// rather than showing an opaque id as if it meant something.
export function activityActorClause(t: AdminDictionary, item: Pick<ActivityItemArtifact, "actorId" | "actorRole">): string | null {
  if (item.actorRole) {
    const roleLabel = t.customerDetailPage.roleLabels[item.actorRole as keyof AdminDictionary["customerDetailPage"]["roleLabels"]];
    if (roleLabel) return t.chat.activityByLabel.replace("{who}", roleLabel);
  }
  if (AUTOMATIC_ACTOR_IDS.has(item.actorId)) return t.chat.activityByAutomatic;
  return null;
}
