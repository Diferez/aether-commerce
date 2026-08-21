import { featureConfigSchema } from "@aether/config-schema";

export const features = featureConfigSchema.parse({
  reviews: true,
  wishlist: true,
  customerAccounts: true,
  stripeCheckout: true,
  // The starter does not deploy an AI Worker. Enable this after supplying NEXT_PUBLIC_AETHER_AI_URL.
  aiAssistant: false,
  inventory: true
});
