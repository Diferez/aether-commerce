import { brandConfigSchema } from "@aether-commerce/config-schema";

export const brandConfig = brandConfigSchema.parse({
  name: "Client Store",
  primaryColor: "#000000"
});
