import { defineClientConfiguration } from "@aether/config-schema";
import { agentConfig } from "../config/agent";
import { brandConfig } from "../config/brand";
import { checkoutConfig } from "../config/checkout";
import { features } from "../config/features";
import { integrations } from "../config/integrations";
import { navigationConfig } from "../config/navigation";
import { storeConfig } from "../config/store";
import { themeConfig } from "../config/theme";

/** Public, validated configuration passed to client-specific app adapters. */
export const clientConfiguration = defineClientConfiguration({
  brand: brandConfig,
  store: storeConfig,
  features,
  theme: themeConfig,
  checkout: checkoutConfig,
  integrations,
  agent: agentConfig,
  navigation: navigationConfig
});
