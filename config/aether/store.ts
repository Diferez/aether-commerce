import { storeConfigSchema } from "@aether-commerce/config-schema";

export const aetherStoreConfig = storeConfigSchema.parse({
  currency: "USD",
  locale: "en-US",
  country: "US"
});
