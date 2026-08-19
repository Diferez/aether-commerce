import { featureConfigSchema } from "@aether/config-schema";

export const features = featureConfigSchema.parse({
  reviews: true, wishlist: true, customerAccounts: true, stripeCheckout: true, aiAssistant: true, inventory: true
});
