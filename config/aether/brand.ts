import { brandConfigSchema } from "@aether/config-schema";

/** Aether demo branding; client stores replace this module, never platform packages. */
export const aetherBrandConfig = brandConfigSchema.parse({
  name: "Aether",
  tagline: {
    en: "Technology, elevated.",
    es: "Tecnologia a otro nivel."
  },
  primaryColor: "#8b5cf6"
});
