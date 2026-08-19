import type { ShippingSettings } from "@aether/core";

/**
 * Reference-store defaults. They deliberately live at the Aether API adapter
 * boundary rather than in platform domain code.
 */
export const aetherDemoShippingSettings: ShippingSettings = {
  freeShippingThreshold: 15000,
  countries: ["US", "CO", "CA", "MX", "ES"],
  options: [
    { id: "standard", label: "International standard", amount: 1499, currency: "USD", estimatedDays: "6-10" },
    { id: "express", label: "Express", amount: 2999, currency: "USD", estimatedDays: "3-5" },
    { id: "priority", label: "Priority", amount: 4499, currency: "USD", estimatedDays: "1-3" }
  ]
};
