"use client";

import { Scale } from "lucide-react";
import { demoProducts } from "../../components/demo-products";
import { formatMoney } from "@aether/core";
import { useLanguage } from "../../components/LanguageProvider";
import { getLocalizedProduct } from "../../components/product-localization";

export default function ComparePage() {
  const { locale, t } = useLanguage();
  const products = demoProducts.slice(0, 3);
  return (
    <main className="aether-shell py-8">
      <p className="flex items-center gap-2 text-sm font-semibold uppercase text-teal-700">
        <Scale size={17} aria-hidden />
        {t.compare}
      </p>
      <h1 className="mt-2 text-4xl font-semibold text-zinc-950">{t.productComparison}</h1>
      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200">
              <th className="p-4">{t.product}</th>
              {products.map((product) => (
                <th key={product.id} className="p-4">{product.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              [t.price, ...products.map((product) => formatMoney(product.finalPrice, "USD", locale === "es" ? "es-CO" : "en-US"))],
              [t.category, ...products.map((product) => getLocalizedProduct(product, locale).category)],
              [t.rating, ...products.map((product) => `${product.rating.average} / 5`)],
              [t.inventory, ...products.map((product) => t.availability[product.inventory.status])]
            ].map((row) => (
              <tr key={row[0]} className="border-b border-zinc-200 last:border-b-0">
                {row.map((cell) => (
                  <td key={cell} className="p-4">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
