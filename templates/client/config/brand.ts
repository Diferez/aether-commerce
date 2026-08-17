import { brandConfigSchema } from "@aether/config-schema";

export const brandConfig = brandConfigSchema.parse({
  name: "Client Store",
  primaryColor: "#000000"
});
