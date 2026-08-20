"use client";

import { Mail, MapPin, Phone } from "lucide-react";
import { ContactForm as PackagedContactForm } from "@aether/storefront-default";
import { legalPolicyVersion } from "./legal-content";

// Wraps the package's generic ContactForm instead of duplicating its form
// fields/submit logic - only the address block (this deployment's real
// contact details) and legalPolicyVersion (from the legal-content module
// this package doesn't own) are deployment-specific.
export function ContactForm() {
  return (
    <PackagedContactForm
      legalPolicyVersion={legalPolicyVersion}
      addressBlock={
        <address className="mt-4 grid gap-2 text-sm not-italic text-ink-muted">
          <span className="flex items-start gap-2">
            <MapPin size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            Carrera 73 # 20A-40, Medellín, Antioquia, Colombia
          </span>
          <a className="focus-ring flex w-fit items-center gap-2 hover:text-ink" href="mailto:diferez676@gmail.com">
            <Mail size={16} className="text-accent" aria-hidden />
            diferez676@gmail.com
          </a>
          <a className="focus-ring flex w-fit items-center gap-2 hover:text-ink" href="tel:+573042749571">
            <Phone size={16} className="text-accent" aria-hidden />
            +57 304 274 9571
          </a>
        </address>
      }
    />
  );
}
