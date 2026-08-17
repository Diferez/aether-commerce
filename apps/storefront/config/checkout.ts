import { checkoutConfigSchema } from "@aether/config-schema";

export const aetherCheckoutConfig = checkoutConfigSchema.parse({
  mode: "stripe",
  successPath: "/checkout/success",
  cancelPath: "/checkout/cancel"
});
