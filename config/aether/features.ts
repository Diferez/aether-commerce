import { featureConfigSchema } from "@aether/config-schema";

export const aetherFeatureConfig = featureConfigSchema.parse({
  reviews: true,
  wishlist: true,
  customerAccounts: true,
  stripeCheckout: true,
  aiAssistant: true,
  inventory: true
});
