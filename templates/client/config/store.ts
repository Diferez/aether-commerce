import { storeConfigSchema } from "@aether/config-schema";

export const storeConfig = storeConfigSchema.parse({ currency: "USD", locale: "en-US", country: "US" });
