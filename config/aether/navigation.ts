import { navigationConfigSchema } from "@aether-commerce/config-schema";

export const aetherNavigationConfig = navigationConfigSchema.parse({
  portfolioUrl: "https://portafolio-aether-commerce.pickofwow.workers.dev",
  portfolioUrlEnv: "NEXT_PUBLIC_PORTFOLIO_URL"
});
