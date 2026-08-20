"use client";

import { CreditCard, Globe2, RotateCcw, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

const icons: LucideIcon[] = [CreditCard, Globe2, RotateCcw, Sparkles];

export function Benefits() {
  const { t } = useLanguage();
  return (
    <section className="border-y border-zinc-200/60 bg-white py-10">
      <div className="aether-shell">
        <h2 className="text-2xl font-semibold text-zinc-950">{t.benefitsHeading}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.benefits.map(([title, body], index) => {
            const Icon = icons[index] ?? Sparkles;
            return (
              <div key={title} className="rounded-lg border border-zinc-200 p-4">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-accent-soft text-accent">
                  <Icon size={18} aria-hidden />
                </span>
                <h3 className="mt-3 text-sm font-semibold text-zinc-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
