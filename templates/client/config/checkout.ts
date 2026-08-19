import { checkoutConfigSchema } from "@aether/config-schema";

export const checkoutConfig = checkoutConfigSchema.parse({ mode: "stripe", successPath: "/checkout/success", cancelPath: "/checkout/cancel" });
