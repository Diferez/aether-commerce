export type ShippingOption = {
  id: "standard" | "express" | "priority";
  label: string;
  amount: number;
  currency: "USD";
  estimatedDays: string;
};

export type ShippingSettings = {
  freeShippingThreshold: number;
  countries: string[];
  options: ShippingOption[];
};

export const defaultShippingSettings: ShippingSettings = {
  freeShippingThreshold: 15000,
  countries: ["US", "CO", "CA", "MX", "ES"],
  options: [
    { id: "standard", label: "International standard", amount: 1499, currency: "USD", estimatedDays: "6-10" },
    { id: "express", label: "Express", amount: 2999, currency: "USD", estimatedDays: "3-5" },
    { id: "priority", label: "Priority", amount: 4499, currency: "USD", estimatedDays: "1-3" }
  ]
};

export function resolveShippingAmount(
  subtotal: number,
  option: ShippingOption,
  settings = defaultShippingSettings
): number {
  if (option.id === "standard" && subtotal >= settings.freeShippingThreshold) {
    return 0;
  }

  return option.amount;
}

export function buildTrackingTimeline(createdAt = new Date()) {
  const start = createdAt.getTime();
  const day = 24 * 60 * 60 * 1000;
  return [
    { status: "pending", location: "Aether fulfillment network", at: new Date(start).toISOString() },
    { status: "preparing", location: "Regional hub", at: new Date(start + day).toISOString() },
    { status: "packed", location: "Export facility", at: new Date(start + day * 2).toISOString() },
    { status: "shipped", location: "International carrier", at: new Date(start + day * 3).toISOString() }
  ];
}
