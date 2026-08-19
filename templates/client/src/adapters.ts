import type { ClientConfiguration } from "@aether/config-schema";

/**
 * Stable, framework-neutral inputs for a client implementation's four app
 * adapters. These modules are intentionally small: a client owns its pages
 * and deployment code while consuming Aether platform packages by version.
 */
export function createClientAppAdapters(configuration: ClientConfiguration) {
  return {
    storefront: {
      brand: configuration.brand,
      store: configuration.store,
      features: configuration.features,
      api: configuration.integrations.api,
      checkout: configuration.checkout
    },
    admin: {
      brand: configuration.brand,
      features: configuration.features,
      api: configuration.integrations.api
    },
    api: {
      store: configuration.store,
      checkout: configuration.checkout,
      integrations: configuration.integrations
    },
    ai: {
      agent: configuration.agent,
      features: configuration.features,
      api: configuration.integrations.api
    }
  } as const;
}
