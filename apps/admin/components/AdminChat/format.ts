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
