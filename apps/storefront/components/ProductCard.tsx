"use client";

import { Bell, Check, Flame, Heart, ShoppingBag, Star } from "lucide-react";
import type { Product } from "@aether/schemas";
import { formatUsd } from "@aether/core";
import { Skeleton } from "@aether/ui";
import { storefrontPath } from "./config";
import { useLanguage } from "./LanguageProvider";
import { getLocalizedProduct } from "./product-localization";
import { ProductBadge } from "./ProductBadge";
import { getImageBadge, getLowStockLabel, isLowStock } from "./product-badge-logic";

export function ProductCard({
  product,
  isFavorite,
  isAdding,
  isAdded,
  onToggleFavorite,
  onAddToCart,
  onNotifyRestock
}: {
  product: Product;
  isFavorite: boolean;
  isAdding: boolean;
  isAdded: boolean;
  onToggleFavorite: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onNotifyRestock?: (product: Product) => void;
}) {
  const { locale, t } = useLanguage();
  const localized = getLocalizedProduct(product, locale);
  const detailHref = storefrontPath(`/products/detail?slug=${encodeURIComponent(product.slug)}`);
  const outOfStock = product.availableStock <= 0;
  const priceLocale = locale === "es" ? "es-CO" : "en-US";
  const imageBadge = getImageBadge(product);
  const lowStock = !outOfStock && isLowStock(product.availableStock);

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition ${
        isAdded ? "border-accent ring-2 ring-accent-soft" : "border-zinc-200 hover:border-border-strong"
      }`}
    >
      <a href={detailHref} className="relative block aspect-square shrink-0 overflow-hidden bg-zinc-50">
        <img
          src={product.thumbnail}
          alt={product.images[0]?.alt || product.name}
          loading="lazy"
          className={`h-full w-full object-contain p-2 transition group-hover:scale-[1.03] ${outOfStock ? "grayscale" : ""}`}
          onError={(event) => {
            event.currentTarget.src =
              "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=60";
          }}
        />

        {outOfStock ? <div className="absolute inset-0 bg-surface/55" aria-hidden /> : null}

        {imageBadge.kind === "discount" ? (
          <ProductBadge variant="discount" className="absolute left-3 top-3">
            -{imageBadge.percentage}%
          </ProductBadge>
        ) : imageBadge.kind === "out_of_stock" ? (
          <ProductBadge
            variant="status"
            tone="danger"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            {t.availability.out_of_stock}
          </ProductBadge>
        ) : null}
      </a>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Redundant with the "out of stock" chip over the image so screen
            reader users get the status even if they don't reach the image's
            absolutely-positioned content in source order. */}
        {outOfStock ? <span className="sr-only">{t.availability.out_of_stock}</span> : null}
        <p
          className={`truncate text-xs font-semibold uppercase tracking-wide ${
            outOfStock ? "text-ink-subtle" : "text-accent"
          }`}
        >
          {product.brand && product.brand !== "Aether" ? product.brand : localized.category}
        </p>
        <a
          href={detailHref}
          className={`line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-tight ${
            outOfStock ? "text-ink-muted" : "text-zinc-950 hover:text-accent"
          }`}
        >
          {product.name}
        </a>
        <div className={`flex items-center gap-1 text-xs ${outOfStock ? "text-ink-subtle" : "text-zinc-600"}`}>
          <Star
            size={13}
            className={outOfStock ? "fill-ink-subtle text-ink-subtle" : "fill-amber-400 text-amber-400"}
            aria-hidden
          />
          <span>{product.rating.average.toFixed(1)}</span>
          <span className={outOfStock ? "text-ink-subtle" : "text-zinc-500"}>({product.reviewCount})</span>
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-1">
          {/* min-h reserves room for the wrapped (2-line) case - price plus
              strikethrough plus savings can wrap to a second line on narrow
              cards, and without a fixed reservation that would misalign the
              anchored block again, just like the chip slot below. */}
          <div className="flex min-h-[46px] flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className={`text-lg font-semibold ${outOfStock ? "text-ink-muted" : "text-zinc-950"}`}>
              {formatUsd(product.finalPrice, priceLocale)}
            </p>
            {product.originalPrice ? (
              <p className="text-xs text-zinc-500 line-through">{formatUsd(product.originalPrice, priceLocale)}</p>
            ) : null}
            {!outOfStock && product.originalPrice ? (
              <span className="text-xs font-medium text-success [font-variant-numeric:tabular-nums]">
                {t.savings.replace("{amount}", formatUsd(product.originalPrice - product.finalPrice, priceLocale))}
              </span>
            ) : null}
          </div>

          {/* Always rendered so the row below never shifts depending on
              whether this product happens to be low on stock - only the
              chip inside is conditional. */}
          <div className="flex min-h-[26px] items-center">
            {lowStock ? (
              <div
                role="status"
                className="inline-flex w-fit items-center gap-1.5 rounded-md bg-warning-tint px-[9px] py-1 text-xs text-warning [font-variant-numeric:tabular-nums]"
              >
                <Flame size={13} aria-hidden />
                <span>{getLowStockLabel(product.availableStock, t)}</span>
              </div>
            ) : null}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                onToggleFavorite(product);
              }}
              className={`focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md border transition hover:bg-zinc-100 ${
                isFavorite ? "border-rose-300 bg-rose-50 text-rose-700" : "border-zinc-300"
              }`}
              aria-label={locale === "es" ? `Guardar ${product.name}` : `Save ${product.name}`}
              aria-pressed={isFavorite}
            >
              <Heart size={16} fill={isFavorite ? "currentColor" : "none"} aria-hidden />
            </button>
            {outOfStock ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  if (onNotifyRestock) {
                    onNotifyRestock(product);
                  } else {
                    // TODO: wire up to a real "notify me when back in stock"
                    // endpoint once the API exposes one - no backend support
                    // exists yet, so this is a stub rather than a dead button.
                    console.info(`[notify-restock] ${product.id} - no endpoint wired yet`);
                  }
                }}
                className="focus-ring flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-ink transition hover:bg-surface-hover"
                aria-label={t.notifyWhenBackInStock.replace("{name}", product.name)}
              >
                <Bell size={16} aria-hidden />
                <span>{t.notifyMe}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  onAddToCart(product);
                }}
                disabled={isAdding}
                className={`focus-ring flex h-9 flex-1 items-center justify-center rounded-md text-white transition ${
                  isAdded ? "scale-105 bg-emerald-600" : isAdding ? "bg-accent-hover" : "bg-accent hover:bg-accent-hover"
                }`}
                aria-label={locale === "es" ? `Agregar ${product.name} al carrito` : `Add ${product.name} to cart`}
                aria-busy={isAdding}
              >
                {isAdded ? (
                  <Check size={18} className="animate-[bounce_0.7s_ease-in-out_1]" aria-hidden />
                ) : (
                  <ShoppingBag size={17} className={isAdding ? "animate-pulse" : ""} aria-hidden />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-16" />
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <Skeleton className="h-6 w-20" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-10" />
          </div>
        </div>
      </div>
    </div>
  );
}
