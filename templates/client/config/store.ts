import { storeConfigSchema } from "@aether-commerce/config-schema";

export const storeConfig = storeConfigSchema.parse({ currency: "USD", locale: "en-US", country: "US" });
