import { defineClientConfiguration } from "@aether/config-schema";
import { agentConfig } from "../config/agent.js";
import { brandConfig } from "../config/brand.js";
import { checkoutConfig } from "../config/checkout.js";
import { features } from "../config/features.js";
import { integrations } from "../config/integrations.js";
import { navigationConfig } from "../config/navigation.js";
import { storeConfig } from "../config/store.js";
import { themeConfig } from "../config/theme.js";

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
