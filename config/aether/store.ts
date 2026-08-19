import { storeConfigSchema } from "@aether/config-schema";

export const aetherStoreConfig = storeConfigSchema.parse({
  currency: "USD",
  locale: "en-US",
  country: "US"
});
