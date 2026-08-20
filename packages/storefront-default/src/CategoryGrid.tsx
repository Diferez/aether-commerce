"use client";

import { useEffect, useMemo, useState } from "react";
import { Glasses, Headphones, Laptop, Lamp, Smartphone, Sofa, Sparkles, Tablet, Timer, Watch } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useStorefrontConfig } from "./AetherStorefrontProvider";
import { useLanguage } from "./LanguageProvider";
import { StorefrontLink } from "./StorefrontLink";

const categoryIcons: Record<string, LucideIcon> = {
  smartphones: Smartphone,
  laptops: Laptop,
  "mobile-accessories": Headphones,
  tablets: Tablet,
  "mens-watches": Watch,
  "womens-watches": Watch,
  sunglasses: Glasses,
  furniture: Sofa,
  "home-decoration": Lamp,
  "sports-accessories": Timer
};

export function CategoryGrid({ limit }: { limit?: number }) {
  const { apiBaseUrl } = useStorefrontConfig();
  const { t } = useLanguage();
  const cards = useMemo(() => (limit ? t.categoryCards.slice(0, limit) : t.categoryCards), [t, limit]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBaseUrl}/api/v1/catalog/categories/counts`)
      .then((response) => response.json())
      .then((payload: { success?: boolean; data?: Array<{ slug: string; count: number }> }) => {
        if (cancelled || !payload.success || !payload.data) return;
        setCounts(Object.fromEntries(payload.data.map(({ slug, count }) => [slug, count])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map(([name, body, slug]) => {
        const Icon = categoryIcons[slug] ?? Sparkles;
        const count = counts[slug] ?? 0;
        return (
          <StorefrontLink
            key={slug}
            href={`/categories/${slug}`}
            className="group rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-accent hover:shadow-md"
          >
            <span className="grid h-11 w-11 place-items-center rounded-md bg-accent-soft text-accent">
              <Icon size={20} aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-semibold text-zinc-950 group-hover:text-accent">{name}</h3>
            <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-zinc-600">{body}</p>
            {/* Reserves the count line's height up front so the card (and
                the CSS grid row it's in) doesn't resize once the counts
                fetch below resolves. */}
            <div className="mt-3 min-h-[1rem]">
              {count > 0 ? <p className="text-xs font-medium text-zinc-500">{t.productsCount.replace("{count}", String(count))}</p> : null}
            </div>
          </StorefrontLink>
        );
      })}
    </div>
  );
}
