"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Minus, Plus, ShoppingBag, Star } from "lucide-react";
import type { Product } from "@aether/schemas";
import { formatUsd } from "@aether/core";
import { Badge, Button } from "@aether/ui";
import { apiBaseUrl, storefrontPath } from "../../../components/config";
import { addProductToCart } from "../../../components/cart-client";
import { useCustomerSession } from "../../../components/customer-client";
import { demoProducts } from "../../../components/demo-products";
import { readFavoriteProducts, toggleFavoriteProduct } from "../../../components/favorites-client";
import { useLanguage } from "../../../components/LanguageProvider";
import { ProductGrid } from "../../../components/ProductGrid";
import { getLocalizedProduct } from "../../../components/product-localization";
import { StorefrontLink } from "../../../components/StorefrontLink";

export function ProductDetailClient({ slug }: { slug: string }) {
  const { locale, t } = useLanguage();
  const router = useRouter();
  const { customer } = useCustomerSession();
  const previousSlugRef = useRef<string | null>(null);
  const fallback = useMemo(() => demoProducts.find((candidate) => candidate.slug === slug) ?? null, [slug]);
  const [product, setProduct] = useState<Product | null>(null);
  const [status, setStatus] = useState<"loading" | "demo" | "live" | "offline" | "not-found">("loading");
  const [isAdding, setIsAdding] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const localized = product ? getLocalizedProduct(product, locale) : null;

  useEffect(() => {
    const previousSlug = previousSlugRef.current;
    previousSlugRef.current = slug;

    if (!previousSlug || previousSlug === slug) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    setProduct(null);
    setActiveImage(0);
    setQuantity(1);
    setStatus("loading");
    fetch(`${apiBaseUrl}/api/v1/products/slug/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { success: boolean; data?: Product }) => {
        if (controller.signal.aborted) return;
        if (payload.success && payload.data) {
          setProduct(payload.data);
          setStatus("live");
          return;
        }
        setProduct(fallback);
        setStatus(fallback ? "demo" : "not-found");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setProduct(fallback);
        setStatus(fallback ? "offline" : "not-found");
      });
    return () => controller.abort();
  }, [fallback, slug]);

  useEffect(() => {
    if (!product) return;
    setIsFavorite(readFavoriteProducts(customer).some((candidate) => candidate.id === product.id));
  }, [product, customer]);

  async function addToCart() {
    if (!product) return;
    setIsAdding(true);
    try {
      for (let i = 0; i < quantity; i += 1) {
        await addProductToCart(product);
      }
      router.push(storefrontPath("/cart"));
    } finally {
      setIsAdding(false);
    }
  }

  function toggleFavorite() {
    if (!product) return;
    const result = toggleFavoriteProduct(product, customer);
    setIsFavorite(result === "added");
  }

  const maxQuantity = product ? Math.max(1, Math.min(25, product.availableStock)) : 1;
  const outOfStock = Boolean(product && product.availableStock <= 0);

  return (
    <main className="aether-shell py-8">
      {status === "not-found" ? (
        <section className="mx-auto max-w-2xl rounded-lg border border-zinc-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold uppercase text-accent">{t.productNotFoundTitle}</p>
          <h1 className="mt-2 text-4xl font-semibold text-zinc-950">{t.productNotFoundTitle}</h1>
          <p className="mt-4 text-zinc-600">{t.productNotFoundDescription}</p>
          <StorefrontLink href="/products" className="focus-ring mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white">
            {t.browseProducts}
          </StorefrontLink>
        </section>
      ) : status === "loading" || !product || !localized ? (
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]" aria-label={locale === "es" ? "Cargando producto" : "Loading product"}>
          <div className="skeleton aspect-square w-full rounded-lg" />
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="skeleton h-4 w-36 rounded" />
            <div className="skeleton mt-4 h-11 w-4/5 rounded" />
            <div className="mt-6 grid gap-3">
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-4 w-11/12 rounded" />
              <div className="skeleton h-4 w-2/3 rounded" />
            </div>
            <div className="skeleton mt-6 h-9 w-32 rounded" />
            <div className="skeleton mt-6 h-11 w-36 rounded" />
          </div>
        </section>
      ) : (
        <section className="grid animate-[fadeIn_0.22s_ease-out] gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
              <Image
                src={product.images[activeImage]?.url ?? product.thumbnail}
                alt={product.images[activeImage]?.alt || product.name}
                fill
                sizes="(min-width: 1024px) 48vw, 100vw"
                className="object-contain p-6"
              />
            </div>
            {product.images.length > 1 ? (
              <div
                className="mt-3 flex gap-2 overflow-x-auto"
                role="listbox"
                aria-label={locale === "es" ? "Galeria de imagenes" : "Image gallery"}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight") setActiveImage((index) => Math.min(product.images.length - 1, index + 1));
                  if (event.key === "ArrowLeft") setActiveImage((index) => Math.max(0, index - 1));
                }}
              >
                {product.images.map((image, index) => (
                  <button
                    key={image.url + index}
                    type="button"
                    role="option"
                    aria-selected={activeImage === index}
                    onClick={() => setActiveImage(index)}
                    aria-label={t.galleryThumbnailLabel.replace("{index}", String(index + 1))}
                    className={`focus-ring relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-zinc-50 ${
                      activeImage === index ? "border-accent" : "border-zinc-200"
                    }`}
                  >
                    <Image src={image.url} alt="" fill sizes="64px" className="object-contain p-1" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm font-semibold uppercase text-accent">
              {status === "live" ? t.liveProductDetail : status === "offline" ? t.offlineProductDetail : t.demoProduct}
            </p>
            {product.brand ? <p className="mt-2 text-sm font-medium text-zinc-500">{product.brand}</p> : null}
            <h1 className="mt-1 text-3xl font-semibold text-zinc-950 sm:text-4xl">{product.name}</h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-zinc-600">
              <span className="flex items-center gap-1">
                <Star size={15} className="fill-amber-400 text-amber-400" aria-hidden />
                {product.rating.average.toFixed(1)}
              </span>
              <span>{t.basedOnReviews.replace("{count}", String(product.reviewCount))}</span>
            </div>

            <div className="mt-4 flex items-baseline gap-3">
              <p className="text-3xl font-semibold text-zinc-950">{formatUsd(product.finalPrice, locale === "es" ? "es-CO" : "en-US")}</p>
              {product.originalPrice ? (
                <>
                  <p className="text-base text-zinc-500 line-through">{formatUsd(product.originalPrice, locale === "es" ? "es-CO" : "en-US")}</p>
                  <Badge tone="accent">-{product.discountPercentage}%</Badge>
                </>
              ) : null}
            </div>

            <p className="mt-4 text-base leading-7 text-zinc-600">{localized.description}</p>

            {product.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {product.tags.slice(0, 6).map((tag) => (
                  <Badge key={tag} tone="neutral">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}

            <dl className="mt-5 grid gap-2 text-sm">
              <div className="flex justify-between"><dt className="text-zinc-500">{t.sku}</dt><dd className="text-zinc-950">{product.sku}</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">{t.category}</dt><dd className="text-zinc-950">{localized.category}</dd></div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">{t.availabilityLabel}</dt>
                <dd>
                  <Badge tone={outOfStock ? "danger" : product.availabilityStatus === "low_stock" ? "warning" : "success"}>
                    {t.availability[product.inventory.status]}
                  </Badge>
                </dd>
              </div>
              {product.minimumOrderQuantity && product.minimumOrderQuantity > 1 ? (
                <div className="flex justify-between"><dt className="text-zinc-500">{t.minimumOrderQuantity}</dt><dd className="text-zinc-950">{product.minimumOrderQuantity}</dd></div>
              ) : null}
            </dl>

            {!outOfStock ? (
              <div className="mt-5 flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-950">{t.quantity}</span>
                <div className="inline-flex items-center gap-2 rounded-md border border-zinc-300">
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    disabled={quantity <= 1}
                    aria-label={locale === "es" ? "Reducir cantidad" : "Decrease quantity"}
                    className="focus-ring grid h-10 w-10 place-items-center text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
                  >
                    <Minus size={14} aria-hidden />
                  </button>
                  <span className="min-w-6 text-center text-sm font-semibold text-zinc-950">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                    disabled={quantity >= maxQuantity}
                    aria-label={locale === "es" ? "Aumentar cantidad" : "Increase quantity"}
                    className="focus-ring grid h-10 w-10 place-items-center text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
                  >
                    <Plus size={14} aria-hidden />
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" onClick={() => void addToCart()} disabled={isAdding || outOfStock}>
                <ShoppingBag size={17} aria-hidden />
                {isAdding ? t.adding : outOfStock ? t.availability.out_of_stock : t.addToCart}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={toggleFavorite}
                aria-pressed={isFavorite}
                className={isFavorite ? "!border-rose-300 !bg-rose-50 !text-rose-700" : undefined}
              >
                <Heart size={17} fill={isFavorite ? "currentColor" : "none"} aria-hidden />
              </Button>
            </div>

            {(product.shippingInformation || product.warrantyInformation || product.returnPolicy) ? (
              <dl className="mt-6 grid gap-2 border-t border-zinc-200 pt-5 text-sm">
                {product.shippingInformation ? (
                  <div className="flex justify-between gap-4"><dt className="text-zinc-500">{t.shippingInfo}</dt><dd className="text-right text-zinc-950">{product.shippingInformation}</dd></div>
                ) : null}
                {product.warrantyInformation ? (
                  <div className="flex justify-between gap-4"><dt className="text-zinc-500">{t.warrantyInfo}</dt><dd className="text-right text-zinc-950">{product.warrantyInformation}</dd></div>
                ) : null}
                {product.returnPolicy ? (
                  <div className="flex justify-between gap-4"><dt className="text-zinc-500">{t.returnPolicyLabel}</dt><dd className="text-right text-zinc-950">{product.returnPolicy}</dd></div>
                ) : null}
              </dl>
            ) : null}
          </div>

          {product.specifications.length > 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-5 lg:col-span-2">
              <h2 className="text-lg font-semibold text-zinc-950">{t.specifications}</h2>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {product.specifications.map((spec) => (
                  <div key={spec.key} className="flex justify-between gap-4 border-b border-zinc-100 py-1.5">
                    <dt className="text-zinc-500">{spec.key}</dt>
                    <dd className="text-right text-zinc-950">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <div className="rounded-lg border border-zinc-200 bg-white p-5 lg:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-950">{t.reviewsHeading}</h2>
              <span className="flex items-center gap-1 text-sm text-zinc-600">
                <Star size={15} className="fill-amber-400 text-amber-400" aria-hidden />
                {product.rating.average.toFixed(1)} · {t.basedOnReviews.replace("{count}", String(product.reviewCount))}
              </span>
            </div>
            {product.reviews.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-600">{t.noReviewsYet}</p>
            ) : (
              <ul className="mt-4 grid gap-4">
                {product.reviews.map((review, index) => (
                  <li key={`${review.reviewerName}-${index}`} className="border-b border-zinc-100 pb-4 last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-zinc-950">{review.reviewerName}</p>
                      <span className="text-xs text-zinc-500">{new Date(review.date).toLocaleDateString(locale === "es" ? "es-CO" : "en-US")}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, starIndex) => (
                        <Star
                          key={starIndex}
                          size={13}
                          className={starIndex < Math.round(review.rating) ? "fill-amber-400 text-amber-400" : "text-zinc-300"}
                          aria-hidden
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">{review.comment}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
      <ProductGrid
        compact
        {...(product?.slug ? { excludeSlug: product.slug } : {})}
        {...(product?.category.slug ? { fixedCategory: product.category.slug } : {})}
        heading={t.relatedProducts}
        description={t.relatedDescription}
      />
    </main>
  );
}
