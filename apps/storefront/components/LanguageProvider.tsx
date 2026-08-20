// Re-exports the default skin's LanguageProvider/useLanguage from
// @aether/storefront-default. apps/storefront/config/dictionaries.ts stays
// in place only because product-localization.ts still reads it directly;
// this file itself no longer does.
export { LanguageProvider, useLanguage } from "@aether/storefront-default";
