import { defineClientConfiguration } from "@aether-commerce/config-schema";
import { aetherAgentConfig } from "./agent";
import { aetherBrandConfig } from "./brand";
import { aetherCheckoutConfig } from "./checkout";
import { aetherFeatureConfig } from "./features";
import { aetherIntegrationConfig } from "./integrations";
import { aetherNavigationConfig } from "./navigation";
import { aetherStoreConfig } from "./store";
import { aetherThemeTokens } from "./theme";
export { aetherThemeTokens } from "./theme";

export * from "./agent";
export * from "./brand";
export * from "./checkout";
export * from "./features";
export * from "./integrations";
export * from "./navigation";
export * from "./store";

/** Complete public configuration for the Aether reference implementation. */
export const aetherClientConfiguration = defineClientConfiguration({
  brand: aetherBrandConfig,
  store: aetherStoreConfig,
  features: aetherFeatureConfig,
  theme: aetherThemeTokens,
  checkout: aetherCheckoutConfig,
  integrations: aetherIntegrationConfig,
  agent: aetherAgentConfig,
  navigation: aetherNavigationConfig
});
