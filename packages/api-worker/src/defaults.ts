import type { ShippingSettings } from "@aether-commerce/core";

/** Used when a store hasn't configured shipping settings yet. */
export const defaultShippingSettings: ShippingSettings = {
  enabled: false,
  amountCents: 0
};
