"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { useStorefrontConfig } from "./AetherStorefrontProvider";
import { useLanguage } from "./LanguageProvider";
import { StorefrontLink } from "./StorefrontLink";

function formString(form: FormData, key: string, fallback = "") {
  const value = form.get(key);
  return typeof value === "string" ? value : fallback;
}

// Deliberately generic: no address/phone block here - those are specific to
// the Aether reference deployment (see apps/storefront/components/
// ContactForm.tsx, which overrides this default with its own real contact
// details instead of re-exporting it - same override pattern as SiteFooter).
// A shared default-skin package must never ship one deployment's contact
// details to every client that keeps the default. legalPolicyVersion is a
// prop (not part of AetherStorefrontProvider's shared config) for the same
// reason AssistantWidget takes it as a prop - it comes from a legal-copy
// module this package doesn't own.
export function ContactForm({ legalPolicyVersion }: Readonly<{ legalPolicyVersion: string }>) {
  const { locale, t } = useLanguage();
  const { apiBaseUrl } = useStorefrontConfig();
  const [status, setStatus] = useState("");
  const labels = t.contactForm;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus(labels.sending);

    const payload = {
      name: formString(form, "name"),
      email: formString(form, "email"),
      subject: formString(form, "subject", labels.defaultSubject),
      message: formString(form, "message"),
      company: formString(form, "company") || undefined,
      website: formString(form, "website"),
      consent: form.get("consent") === "on",
      privacyVersion: legalPolicyVersion,
      locale
    };

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      setStatus(response.ok ? labels.success : labels.error);
    } catch {
      setStatus(labels.offline);
    }
  }

  return (
    <section className="aether-shell py-10" aria-labelledby="contact-heading">
      <div className="grid gap-6 rounded-lg border border-zinc-200 bg-white p-5 md:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase text-accent">
            <Mail size={17} aria-hidden />
            {labels.eyebrow}
          </p>
          <h2 id="contact-heading" className="mt-2 text-2xl font-semibold text-zinc-950">
            {labels.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">{labels.description}</p>
          <p className="mt-4 rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700">
            {status || labels.ready}
          </p>
        </div>
        <form onSubmit={(event) => void submit(event)} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="name"
              required
              minLength={2}
              placeholder={labels.name}
              className="min-h-11 rounded-md border border-zinc-300 px-3"
            />
            <input
              name="email"
              required
              type="email"
              placeholder={labels.email}
              className="min-h-11 rounded-md border border-zinc-300 px-3"
            />
          </div>
          <input
            name="company"
            placeholder={labels.company}
            className="min-h-11 rounded-md border border-zinc-300 px-3"
          />
          <input
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />
          <input
            name="subject"
            required
            minLength={3}
            placeholder={labels.subject}
            className="min-h-11 rounded-md border border-zinc-300 px-3"
          />
          <textarea
            name="message"
            required
            minLength={10}
            placeholder={labels.message}
            rows={4}
            className="rounded-md border border-zinc-300 px-3 py-3"
          />
          <label className="flex items-start gap-3 text-sm leading-6 text-zinc-600">
            <input name="consent" type="checkbox" required className="mt-1" />
            <span>
              {labels.consent}{" "}
              <StorefrontLink
                className="focus-ring font-semibold text-ink underline decoration-accent underline-offset-4"
                href="/privacy"
              >
                {locale === "es" ? "Leer política de privacidad." : "Read the privacy policy."}
              </StorefrontLink>
            </span>
          </label>
          <button className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover">
            <Send size={17} aria-hidden />
            {labels.submit}
          </button>
        </form>
      </div>
    </section>
  );
}
