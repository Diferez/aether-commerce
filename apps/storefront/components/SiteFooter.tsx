"use client";

import { ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { StorefrontLink } from "./StorefrontLink";

export function SiteFooter() {
  const { locale } = useLanguage();
  const copy =
    locale === "es"
      ? {
          description: "Demostración técnica de comercio. No procesa ventas ni envíos reales.",
          legal: "Legal y privacidad",
          help: "Información de la demo",
          privacy: "Privacidad",
          cookies: "Cookies",
          terms: "Términos",
          returns: "Devoluciones",
          shipping: "Envíos",
          contact: "Contacto",
          sic: "Autoridad de protección al consumidor (SIC)",
          copyright:
            "Todos los derechos reservados. Las marcas de terceros pertenecen a sus titulares."
        }
      : {
          description: "Technical commerce demonstration. It processes no real sales or shipping.",
          legal: "Legal and privacy",
          help: "Demo information",
          privacy: "Privacy",
          cookies: "Cookies",
          terms: "Terms",
          returns: "Returns",
          shipping: "Shipping",
          contact: "Contact",
          sic: "Colombian consumer authority (SIC)",
          copyright: "All rights reserved. Third-party marks belong to their owners."
        };

  return (
    <footer className="mt-14 border-t border-border bg-surface/80">
      <div className="aether-shell grid gap-8 py-10 md:grid-cols-[1.25fr_0.75fr_0.75fr]">
        <div>
          <p className="text-lg font-semibold text-ink">Aether</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-ink-muted">{copy.description}</p>
          <address className="mt-5 grid gap-2 text-sm not-italic text-ink-muted">
            <span className="flex items-start gap-2">
              <MapPin size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              Carrera 73 # 20A-40, Medellín, Antioquia, Colombia
            </span>
            <a
              className="focus-ring flex w-fit items-center gap-2 hover:text-ink"
              href="mailto:diferez676@gmail.com"
            >
              <Mail size={16} className="text-accent" aria-hidden />
              diferez676@gmail.com
            </a>
            <a
              className="focus-ring flex w-fit items-center gap-2 hover:text-ink"
              href="tel:+573042749571"
            >
              <Phone size={16} className="text-accent" aria-hidden />
              +57 304 274 9571
            </a>
          </address>
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
            <a
              className="focus-ring inline-flex w-fit items-center gap-1 hover:text-ink"
              href="https://sedeelectronica.sic.gov.co/"
              target="_blank"
              rel="noreferrer"
            >
              {copy.sic}
              <ExternalLink size={13} aria-hidden />
            </a>
          </div>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="aether-shell py-4 text-xs leading-5 text-ink-subtle">
          © {new Date().getFullYear()} Diego Fernando Martinez. {copy.copyright}
        </p>
      </div>
    </footer>
  );
}
