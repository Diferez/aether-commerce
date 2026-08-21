"use client";

import Image from "next/image";
import { useState } from "react";
import { Heart, ShoppingBag, Trash2 } from "lucide-react";
import { formatMoney } from "@aether-commerce/core";
import type { Product } from "@aether-commerce/schemas";
import { Badge, Button } from "@aether-commerce/ui";
import { useCart } from "./CartProvider";
import { useCustomerSession } from "./customer-client";
import { useFavorites } from "./FavoritesProvider";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedProduct } from "./product-localization";
import { StorefrontLink } from "./StorefrontLink";

export function FavoritesPage() {
  const { locale, t } = useLanguage();
  const { customer } = useCustomerSession();
  const { favorites, removeFavorite } = useFavorites();
  const { addItem } = useCart();
  const [movingId, setMovingId] = useState<string | null>(null);

  async function moveToCart(product: Product) {
    setMovingId(product.id);
    try {
      await addItem(product);
      removeFavorite(product.id);
      // Open the quick-view drawer instead of navigating to /cart - confirms
      // the move without pulling the shopper off the favorites page.
      window.dispatchEvent(new Event("aether-open-cart"));
    } finally {
      setMovingId(null);
    }
  }

  return (
    <main className="aether-shell py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase text-accent">
            <Heart size={17} aria-hidden />
            {t.favorites}
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-zinc-950">{t.savedProducts}</h1>
          <p className="mt-2 text-zinc-600">
            {customer ? t.savedFor.replace("{name}", customer.name) : t.favoritesSignInHint}
          </p>
        </div>
        {!customer ? (
          <StorefrontLink href="/login" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white">
            {t.signIn}
          </StorefrontLink>
        ) : null}
      </div>

      {favorites.length === 0 ? (
        <section className="grid place-items-center gap-3 rounded-lg border border-zinc-200 bg-white p-10 text-center">
          <Heart size={32} className="text-zinc-400" aria-hidden />
          <p className="text-lg font-semibold text-zinc-950">{t.wishlistEmptyTitle}</p>
          <p className="text-zinc-600">{t.wishlistEmptyDescription}</p>
          <StorefrontLink href="/products" className="focus-ring mt-2 inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-white">
            {t.browseProducts}
          </StorefrontLink>
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {favorites.map((product) => {
            const localized = getLocalizedProduct(product, locale);
            const outOfStock = product.availableStock <= 0;
            return (
              <article key={product.id} className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
                <StorefrontLink href={`/products/${encodeURIComponent(product.slug)}`} className="relative block aspect-square bg-zinc-50">
                  <Image src={product.images[0]?.url ?? product.thumbnail} alt={product.name} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-contain p-4" />
                  {outOfStock ? (
                    <Badge tone="danger" className="absolute right-2 top-2">
                      {t.availability.out_of_stock}
                    </Badge>
                  ) : null}
                </StorefrontLink>
                <div className="grid gap-3 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-accent">{localized.category}</p>
                    <StorefrontLink
                      href={`/products/${encodeURIComponent(product.slug)}`}
                      className="mt-1 block text-lg font-semibold text-zinc-950 hover:text-accent"
                    >
                      {product.name}
                    </StorefrontLink>
                  </div>
                  <p className="line-clamp-2 text-sm leading-6 text-zinc-600">{localized.description}</p>
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-zinc-950">{formatMoney(product.finalPrice, product.currency, locale === "es" ? "es-CO" : "en-US")}</strong>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void moveToCart(product)}
                        disabled={outOfStock || movingId === product.id}
                        className="!min-h-10 !px-3"
                        aria-label={t.moveToCart}
                      >
                        <ShoppingBag size={16} aria-hidden />
                      </Button>
                      <button
                        type="button"
                        onClick={() => removeFavorite(product.id)}
                        className="focus-ring grid h-10 w-10 place-items-center rounded-md border border-zinc-300 hover:bg-zinc-100"
                        aria-label={t.removeFavorite.replace("{name}", product.name)}
                      >
                        <Trash2 size={17} aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
