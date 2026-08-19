import type { ShippingSettings } from "@aether/core";

/**
 * Reference-store defaults. They deliberately live at the Aether API adapter
 * boundary rather than in platform domain code.
 */
export const aetherDemoShippingSettings: ShippingSettings = {
  enabled: false,
  amountCents: 0
};
