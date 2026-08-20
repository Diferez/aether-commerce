"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Scale, ShoppingBag, Star, Trash2 } from "lucide-react";
import { formatMoney } from "@aether/core";
import type { Product } from "@aether/schemas";
import { Badge, Button } from "@aether/ui";
import { createCartClient } from "./cart-client";
import { clearCompareProducts, readCompareProducts, removeCompareProduct } from "./compare-client";
import { useStorefrontConfig } from "./AetherStorefrontProvider";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedProduct } from "./product-localization";
import { StorefrontLink } from "./StorefrontLink";

function availabilityTone(outOfStock: boolean, status: string): "danger" | "warning" | "success" {
  if (outOfStock) return "danger";
  if (status === "low_stock") return "warning";
  return "success";
}

export function ComparePage() {
  const { locale, t } = useLanguage();
  const { apiBaseUrl } = useStorefrontConfig();
  const cartClient = useMemo(() => createCartClient(apiBaseUrl), [apiBaseUrl]);
  const [products, setProducts] = useState<Product[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setProducts(readCompareProducts());
    sync();
    window.addEventListener("aether-compare-changed", sync);
    return () => window.removeEventListener("aether-compare-changed", sync);
  }, []);

  async function addToCart(product: Product) {
    setAddingId(product.id);
    try {
      await cartClient.addProductToCart(product);
      window.dispatchEvent(new Event("aether-open-cart"));
    } finally {
      setAddingId(null);
    }
  }

  const specKeys = [...new Set(products.flatMap((product) => product.specifications.map((spec) => spec.key)))];

  return (
    <main className="aether-shell py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase text-accent">
            <Scale size={17} aria-hidden />
            {t.compareProducts}
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-zinc-950">{t.compareProducts}</h1>
        </div>
        {products.length > 0 ? (
          <Button type="button" variant="outline" onClick={clearCompareProducts}>
            <Trash2 size={16} aria-hidden />
            {t.clearComparison}
          </Button>
        ) : null}
      </div>

      {products.length === 0 ? (
        <section className="grid place-items-center gap-3 rounded-lg border border-zinc-200 bg-white p-10 text-center">
          <Scale size={32} className="text-zinc-400" aria-hidden />
          <p className="text-zinc-600">{t.compareEmpty}</p>
          <StorefrontLink href="/products" className="focus-ring mt-2 inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-white">
            {t.browseProducts}
          </StorefrontLink>
        </section>
      ) : (
        <section className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="w-40 border-b border-zinc-200 p-4 align-bottom text-zinc-500">{t.compareAttribute}</th>
                {products.map((product) => {
                  const localized = getLocalizedProduct(product, locale);
                  const outOfStock = product.availableStock <= 0;
                  return (
                    <th key={product.id} className="min-w-[220px] border-b border-zinc-200 p-4 align-bottom">
                      <button
                        type="button"
                        onClick={() => removeCompareProduct(product.id)}
                        className="focus-ring mb-2 ml-auto flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                        aria-label={t.removeFromCompare}
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                      <StorefrontLink href={`/products/${encodeURIComponent(product.slug)}`} className="relative mx-auto block aspect-square w-24 bg-zinc-50">
                        <Image src={product.images[0]?.url ?? product.thumbnail} alt={product.name} fill sizes="96px" className="object-contain" />
                      </StorefrontLink>
                      <StorefrontLink href={`/products/${encodeURIComponent(product.slug)}`} className="mt-2 block font-semibold text-zinc-950 hover:text-accent">
                        {product.name}
                      </StorefrontLink>
                      <p className="mt-1 text-xs uppercase text-zinc-500">{localized.category}</p>
                      <div className="mt-3">
                        <Button
                          type="button"
                          onClick={() => void addToCart(product)}
                          disabled={outOfStock || addingId === product.id}
                          className="!min-h-9 w-full !px-3 !text-xs"
                        >
                          <ShoppingBag size={14} aria-hidden />
                          {outOfStock ? t.availability.out_of_stock : t.addToCart}
                        </Button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className="border-b border-zinc-100 p-4 font-medium text-zinc-500">{t.price}</th>
                {products.map((product) => (
                  <td key={product.id} className="border-b border-zinc-100 p-4 font-semibold text-zinc-950">
                    {formatMoney(product.finalPrice, "USD", locale === "es" ? "es-CO" : "en-US")}
                  </td>
                ))}
              </tr>
              <tr>
                <th className="border-b border-zinc-100 p-4 font-medium text-zinc-500">{t.rating}</th>
                {products.map((product) => (
                  <td key={product.id} className="border-b border-zinc-100 p-4">
                    <span className="inline-flex items-center gap-1 text-zinc-950">
                      <Star size={14} className="fill-amber-400 text-amber-400" aria-hidden />
                      {product.rating.average.toFixed(1)}
                    </span>
                  </td>
                ))}
              </tr>
              <tr>
                <th className="border-b border-zinc-100 p-4 font-medium text-zinc-500">{t.availabilityLabel}</th>
                {products.map((product) => {
                  const outOfStock = product.availableStock <= 0;
                  return (
                    <td key={product.id} className="border-b border-zinc-100 p-4">
                      <Badge tone={availabilityTone(outOfStock, product.availabilityStatus)}>
                        {t.availability[product.inventory.status]}
                      </Badge>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th className="border-b border-zinc-100 p-4 font-medium text-zinc-500">{t.sku}</th>
                {products.map((product) => (
                  <td key={product.id} className="border-b border-zinc-100 p-4 text-zinc-700">
                    {product.sku}
                  </td>
                ))}
              </tr>
              {specKeys.map((key) => (
                <tr key={key}>
                  <th className="border-b border-zinc-100 p-4 font-medium text-zinc-500">{key}</th>
                  {products.map((product) => (
                    <td key={product.id} className="border-b border-zinc-100 p-4 text-zinc-700">
                      {product.specifications.find((spec) => spec.key === key)?.value ?? "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
