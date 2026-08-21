"use client";

import { CategoryGrid, useLanguage } from "@aether/storefront-default";

export default function CategoriesPage() {
  const { t } = useLanguage();
  return (
    <main className="aether-shell py-8">
      <p className="text-sm font-semibold uppercase text-accent">{t.categories}</p>
      <h1 className="mt-2 text-4xl font-semibold text-zinc-950">{t.shopByCategory}</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600">{t.featuredCategoriesDescription}</p>
      <div className="mt-6">
        <CategoryGrid />
      </div>
    </main>
  );
}
