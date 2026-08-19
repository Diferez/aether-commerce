// A single admin-configured flat fee, applied to every checkout as-is when
// enabled (see cart.ts's getShippingCents) - no per-option/per-country
// tiers, since nothing in this codebase ever offered more than one shipping
// choice to a shopper.
export type ShippingSettings = {
  enabled: boolean;
  amountCents: number;
};

export function buildTrackingTimeline(
  createdAt = new Date(),
  locations: Partial<Record<"pending" | "preparing" | "packed" | "shipped", string>> = {}
) {
  const start = createdAt.getTime();
  const day = 24 * 60 * 60 * 1000;
  return [
    { status: "pending", location: locations.pending || "Fulfillment network", at: new Date(start).toISOString() },
    { status: "preparing", location: locations.preparing || "Regional hub", at: new Date(start + day).toISOString() },
    { status: "packed", location: locations.packed || "Export facility", at: new Date(start + day * 2).toISOString() },
    { status: "shipped", location: locations.shipped || "International carrier", at: new Date(start + day * 3).toISOString() }
  ];
}
