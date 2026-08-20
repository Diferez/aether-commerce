"use client";

import { useStorefrontConfig } from "./AetherStorefrontProvider";
import { useLanguage } from "./LanguageProvider";
import { StorefrontLink } from "./StorefrontLink";

// Deliberately generic: no address/email/phone/demo-disclaimer here - those
// were specific to the Aether reference deployment (see
// apps/storefront/components/SiteFooter.tsx, which overrides this default
// with its own richer footer instead of re-exporting it - a live example of
// the same override pattern a generated client uses). A shared default-skin
// package must never ship one deployment's contact details to every client
// that keeps the default.
export function SiteFooter() {
  const { locale } = useLanguage();
  const { config } = useStorefrontConfig();
  const copy =
    locale === "es"
      ? {
          legal: "Legal y privacidad",
          help: "Ayuda",
          privacy: "Privacidad",
          cookies: "Cookies",
          terms: "Términos",
          returns: "Devoluciones",
          shipping: "Envíos",
          contact: "Contacto"
        }
      : {
          legal: "Legal and privacy",
          help: "Help",
          privacy: "Privacy",
          cookies: "Cookies",
          terms: "Terms",
          returns: "Returns",
          shipping: "Shipping",
          contact: "Contact"
        };

  return (
    <footer className="mt-14 border-t border-border bg-surface/80">
      <div className="aether-shell grid gap-8 py-10 md:grid-cols-[1.25fr_0.75fr_0.75fr]">
        <div>
          <p className="text-lg font-semibold text-ink">{config.brand.name}</p>
          {config.brand.tagline?.[locale] ? (
            <p className="mt-2 max-w-md text-sm leading-6 text-ink-muted">{config.brand.tagline[locale]}</p>
          ) : null}
        </div>
        <nav aria-label={copy.legal}>
          <p className="text-sm font-semibold text-ink">{copy.legal}</p>
          <div className="mt-3 grid gap-2 text-sm text-ink-muted">
            <StorefrontLink className="focus-ring w-fit hover:text-ink" href="/privacy">
              {copy.privacy}
            </StorefrontLink>
            <StorefrontLink className="focus-ring w-fit hover:text-ink" href="/cookies">
              {copy.cookies}
            </StorefrontLink>
            <StorefrontLink className="focus-ring w-fit hover:text-ink" href="/terms">
              {copy.terms}
            </StorefrontLink>
          </div>
        </nav>
        <nav aria-label={copy.help}>
          <p className="text-sm font-semibold text-ink">{copy.help}</p>
          <div className="mt-3 grid gap-2 text-sm text-ink-muted">
            <StorefrontLink className="focus-ring w-fit hover:text-ink" href="/shipping">
              {copy.shipping}
            </StorefrontLink>
            <StorefrontLink className="focus-ring w-fit hover:text-ink" href="/returns">
              {copy.returns}
            </StorefrontLink>
            <StorefrontLink className="focus-ring w-fit hover:text-ink" href="/contact">
              {copy.contact}
            </StorefrontLink>
          </div>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="aether-shell py-4 text-xs leading-5 text-ink-subtle">
          © {new Date().getFullYear()} {config.brand.name}. {locale === "es" ? "Todos los derechos reservados." : "All rights reserved."}
        </p>
      </div>
    </footer>
  );
}
