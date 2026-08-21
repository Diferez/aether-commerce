import { checkoutConfigSchema } from "@aether-commerce/config-schema";

export const aetherCheckoutConfig = checkoutConfigSchema.parse({
  mode: "stripe",
  successPath: "/checkout/success",
  cancelPath: "/checkout/cancel"
});
