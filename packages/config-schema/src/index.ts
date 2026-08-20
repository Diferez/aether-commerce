import { z } from "zod";

const localizedTextSchema = z
  .object({
    es: z.string().min(1).optional(),
    en: z.string().min(1).optional()
  })
  .strict();

const urlSchema = z.string().url();

/** Public visual identity. Secrets and provider credentials never belong here. */
export const brandConfigSchema = z
  .object({
    name: z.string().min(1),
    tagline: localizedTextSchema.optional(),
    logoUrl: urlSchema.optional(),
    faviconUrl: urlSchema.optional(),
    primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i, "primaryColor must be a hex color")
  })
  .strict();

/** Store-level defaults used by adapters and presentation layers. */
export const storeConfigSchema = z
  .object({
    currency: z.string().length(3).transform((value) => value.toUpperCase()),
    locale: z.string().min(2),
    country: z.string().length(2).transform((value) => value.toUpperCase())
  })
  .strict();

/** Only flags backed by current Aether capabilities are represented. */
export const featureConfigSchema = z
  .object({
    reviews: z.boolean(),
    wishlist: z.boolean(),
    customerAccounts: z.boolean(),
    stripeCheckout: z.boolean(),
    aiAssistant: z.boolean(),
    inventory: z.boolean()
  })
  .strict();

// Field names and types are deliberately kept structurally identical to
// @aether/ui/theme.ts's ThemeTokens (primary/secondary/background/surface/
// text/muted/border/radius/font) so a ThemeConfig can be passed anywhere a
// ThemeTokens is expected without either package depending on the other -
// config-schema may not depend on @aether/ui (see
// scripts/check-platform-boundaries.mjs's policy map).
export const themeConfigSchema = z
  .object({
    primary: z.string().min(1),
    secondary: z.string().min(1),
    background: z.string().min(1),
    surface: z.string().min(1),
    text: z.string().min(1),
    muted: z.string().min(1),
    border: z.string().min(1),
    radius: z.string().min(1),
    font: z.string().min(1)
  })
  .strict();

export const checkoutConfigSchema = z
  .object({
    mode: z.enum(["stripe", "wompi"]),
    successPath: z.string().startsWith("/"),
    cancelPath: z.string().startsWith("/")
  })
  .strict();

/** Public integration metadata. Provider secrets stay in runtime environment bindings. */
export const integrationConfigSchema = z
  .object({
    api: z
      .object({
        productionBaseUrl: urlSchema,
        localBaseUrl: urlSchema,
        publicUrlEnv: z.string().min(1)
      })
      .strict(),
    auth: z
      .object({
        provider: z.literal("clerk"),
        publishableKeyEnv: z.string().min(1)
      })
      .strict(),
    media: z
      .object({ provider: z.literal("cloudinary") })
      .strict(),
    payments: z
      .object({ provider: z.literal("stripe") })
      .strict()
  })
  .strict();

export const agentConfigSchema = z
  .object({
    enabled: z.boolean(),
    publicUrlEnv: z.string().min(1),
    defaultLocale: z.string().min(2),
    maxInputCharacters: z.number().int().positive().optional()
  })
  .strict();

export const navigationConfigSchema = z
  .object({
    portfolioUrl: urlSchema.optional(),
    portfolioUrlEnv: z.string().min(1).optional()
  })
  .strict();

export const clientConfigurationSchema = z
  .object({
    brand: brandConfigSchema,
    store: storeConfigSchema,
    features: featureConfigSchema,
    theme: themeConfigSchema,
    checkout: checkoutConfigSchema,
    integrations: integrationConfigSchema,
    agent: agentConfigSchema,
    navigation: navigationConfigSchema
  })
  .strict();

export type BrandConfig = z.output<typeof brandConfigSchema>;
export type StoreConfig = z.output<typeof storeConfigSchema>;
export type FeatureConfig = z.output<typeof featureConfigSchema>;
export type ThemeConfig = z.output<typeof themeConfigSchema>;
export type CheckoutConfig = z.output<typeof checkoutConfigSchema>;
export type IntegrationConfig = z.output<typeof integrationConfigSchema>;
export type AgentConfig = z.output<typeof agentConfigSchema>;
export type NavigationConfig = z.output<typeof navigationConfigSchema>;
export type ClientConfiguration = z.output<typeof clientConfigurationSchema>;

/** Validates a client implementation at module boundaries without exposing secrets. */
export function defineClientConfiguration(input: z.input<typeof clientConfigurationSchema>): ClientConfiguration {
  return clientConfigurationSchema.parse(input);
}
