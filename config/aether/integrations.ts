import { integrationConfigSchema } from "@aether-commerce/config-schema";

export const aetherIntegrationConfig = integrationConfigSchema.parse({
  api: {
    productionBaseUrl: "https://aether-api.pickofwow.workers.dev",
    localBaseUrl: "http://localhost:8787",
    publicUrlEnv: "NEXT_PUBLIC_AETHER_API_URL"
  },
  auth: {
    provider: "clerk",
    publishableKeyEnv: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
  },
  media: { provider: "cloudinary" },
  payments: { provider: "stripe" }
});
