"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import type { Product } from "@aether-commerce/schemas";
import { useStorefrontConfig } from "./AetherStorefrontProvider";
import { useLanguage } from "./LanguageProvider";
import { StorefrontLink } from "./StorefrontLink";

export function Hero() {
  const { t } = useLanguage();
  const { apiBaseUrl } = useStorefrontConfig();
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBaseUrl}/api/v1/catalog/products?featured=true&pageSize=4&sort=rating`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { success: boolean; data?: Product[] }) => {
        if (payload.success && payload.data) setProducts(payload.data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [apiBaseUrl]);

  return (
    <section className="border-b border-zinc-200/60 py-8 sm:py-16">
      <div className="aether-shell grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">{t.heroEyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight text-zinc-950 sm:mt-3 sm:text-4xl lg:text-5xl">{t.heroTitle}</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-zinc-600">{t.heroDescription}</p>
          <div className="mt-5 flex flex-wrap gap-3 sm:mt-7">
            <StorefrontLink
              href="/products"
              className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              {t.heroCtaPrimary}
              <ArrowRight size={16} aria-hidden />
            </StorefrontLink>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("aether-open-assistant"))}
              className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-md border border-border-strong bg-surface px-5 text-sm font-semibold text-ink transition hover:border-accent hover:bg-accent hover:text-white active:border-accent-hover active:bg-accent-hover active:text-white"
            >
              <MessageCircle size={16} aria-hidden />
              {t.heroCtaSecondary}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(products.length > 0 ? products : Array.from<Product | undefined>({ length: 4 })).slice(0, 4).map((product, index) => (
            product ? (
              <StorefrontLink
                key={product.id}
                href={`/products/${encodeURIComponent(product.slug)}`}
                className={`relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 ${
                  index === 0 ? "col-span-2 aspect-[7/3] sm:aspect-[2/1]" : "aspect-square"
                }`}
              >
                <Image src={product.thumbnail} alt={product.name} fill sizes="(min-width: 1024px) 22vw, 50vw" className="object-contain p-3" />
              </StorefrontLink>
            ) : (
              <div
                key={index}
                className={`relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 ${
                  index === 0 ? "col-span-2 aspect-[7/3] sm:aspect-[2/1]" : "aspect-square"
                }`}
              >
                <div className="skeleton h-full w-full" />
              </div>
            )
          ))}
        </div>
      </div>
    </section>
  );
}
