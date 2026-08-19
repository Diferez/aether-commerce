"use client";

import { CreditCard, ShieldCheck, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { storefrontPath } from "../../components/config";
import { useLanguage } from "../../components/LanguageProvider";

const highlightIcons: LucideIcon[] = [ShieldCheck, CreditCard, Truck];

export default function CheckoutPage() {
  const { t } = useLanguage();

  return (
    <main className="aether-shell py-8">
      <p className="text-sm font-semibold uppercase text-cyan-300">{t.checkoutPage.eyebrow}</p>
      <h1 className="mt-2 text-4xl font-semibold">{t.checkoutPage.title}</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {t.checkoutPage.highlights.map(([title, body], index) => {
          const Icon = highlightIcons[index] ?? ShieldCheck;
          return (
            <section key={title} className="rounded-lg border border-zinc-200 bg-white p-5">
              <Icon aria-hidden className="text-cyan-300" />
              <h2 className="mt-4 text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
            </section>
          );
        })}
      </div>
      <a href={storefrontPath("/cart")} className="focus-ring mt-6 inline-flex min-h-11 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white">
        {t.checkoutPage.continueFromCart}
      </a>
    </main>
  );
}
