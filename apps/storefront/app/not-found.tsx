"use client";

import { ArrowRight, Compass, Home, SearchX, Sparkles } from "lucide-react";
import { StorefrontLink } from "../components/StorefrontLink";
import { useLanguage } from "../components/LanguageProvider";

export default function NotFoundPage() {
  const { t } = useLanguage();

  return (
    <main className="aether-shell grid min-h-[calc(100vh-4rem)] place-items-center py-12 sm:py-16">
      <section className="relative w-full overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-[0_24px_80px_rgba(15,23,42,0.10)] sm:p-10 lg:p-14">
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent-soft blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-accent-2-soft blur-3xl"
        />

        <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] lg:gap-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              <SearchX size={15} aria-hidden />
              {t.notFoundEyebrow}
            </p>

            <p
              className="mt-6 text-[clamp(5.5rem,18vw,10rem)] font-semibold leading-[0.78] tracking-[-0.08em] text-ink"
              aria-hidden="true"
            >
              404
            </p>
            <h1 className="mt-7 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {t.notFoundTitle}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-ink-muted">{t.notFoundDescription}</p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <StorefrontLink
                href="/"
                className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover"
              >
                <Home size={17} aria-hidden />
                {t.returnHome}
              </StorefrontLink>
              <StorefrontLink
                href="/products"
                className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-5 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                {t.exploreCatalog}
                <ArrowRight size={17} aria-hidden />
              </StorefrontLink>
            </div>
          </div>

          <div aria-hidden="true" className="relative mx-auto grid aspect-square w-full max-w-sm place-items-center">
            <div className="absolute inset-[8%] rounded-full border border-dashed border-border-strong" />
            <div className="absolute inset-[22%] rounded-full border border-accent/25 bg-accent-soft" />
            <div className="absolute left-[8%] top-[47%] grid h-14 w-14 place-items-center rounded-xl border border-border bg-surface text-accent shadow-lg">
              <Compass size={25} />
            </div>
            <div className="absolute right-[10%] top-[13%] grid h-12 w-12 place-items-center rounded-full border border-border bg-surface text-accent-2 shadow-lg">
              <Sparkles size={21} />
            </div>
            <div className="relative grid h-32 w-32 place-items-center rounded-3xl border border-accent/20 bg-surface shadow-[0_18px_50px_rgba(139,92,246,0.18)]">
              <SearchX className="text-accent" size={52} strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
