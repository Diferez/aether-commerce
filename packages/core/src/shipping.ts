export type ShippingOption = {
  id: string;
  label: string;
  amount: number;
  currency: string;
  estimatedDays: string;
};

export type ShippingSettings = {
  freeShippingThreshold: number;
  countries: string[];
  options: ShippingOption[];
};

export function resolveShippingAmount(
  subtotal: number,
  option: ShippingOption,
  settings: ShippingSettings
): number {
  if (option.id === "standard" && subtotal >= settings.freeShippingThreshold) {
    return 0;
  }

  return option.amount;
}

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
