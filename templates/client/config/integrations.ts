import { integrationConfigSchema } from "@aether/config-schema";

export const integrations = integrationConfigSchema.parse({
  api: { productionBaseUrl: "https://api.example.com", localBaseUrl: "http://localhost:8787", publicUrlEnv: "NEXT_PUBLIC_AETHER_API_URL" },
  auth: { provider: "clerk", publishableKeyEnv: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" },
  media: { provider: "cloudinary" }, payments: { provider: "stripe" }
});
