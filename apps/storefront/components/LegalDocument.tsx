"use client";

import { ExternalLink } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { legalDocuments, type LegalDocumentKey } from "./legal-content";

export function LegalDocument({ documentKey }: { documentKey: LegalDocumentKey }) {
  const { locale } = useLanguage();
  const document = legalDocuments[locale][documentKey];

  return (
    <main className="aether-shell py-10 md:py-14">
      <article className="mx-auto max-w-4xl">
        <header className="border-b border-border pb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
            {document.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight text-ink md:text-5xl">
            {document.title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-ink-muted">{document.summary}</p>
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-subtle">
            {document.updated}
          </p>
        </header>

        <div className="divide-y divide-border">
          {document.sections.map((section) => (
            <section
              key={section.title}
              className="py-7"
              aria-labelledby={`${documentKey}-${section.title}`}
            >
              <h2 id={`${documentKey}-${section.title}`} className="text-xl font-semibold text-ink">
                {section.title}
              </h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-[15px] leading-7 text-ink-muted">
                  {paragraph}
                </p>
              ))}
              {section.items?.length ? (
                <ul className="mt-4 grid gap-3 pl-5 text-[15px] leading-7 text-ink-muted">
                  {section.items.map((item) => (
                    <li key={item} className="list-disc pl-1 marker:text-accent">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
              {section.links?.length ? (
                <div className="mt-5 flex flex-wrap gap-3">
                  {section.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
                    >
                      {link.label}
                      <ExternalLink size={14} aria-hidden />
                    </a>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
