"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Search, SlidersHorizontal, X } from "lucide-react";
import type { Product } from "@aether/schemas";
import { Badge, Button, Input, Select, Sheet } from "@aether/ui";
import { useStorefrontConfig } from "./AetherStorefrontProvider";
import { useCart } from "./CartProvider";
import { useFavorites } from "./FavoritesProvider";
import { useLanguage } from "./LanguageProvider";
import { ProductCard, ProductCardSkeleton } from "./ProductCard";
import { StorefrontLink } from "./StorefrontLink";

type ApiPagination = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

type ApiProducts = {
  success: true;
  data: Product[];
  pagination?: ApiPagination;
};

type ApiList = { success: true; data: Array<{ slug: string; name: string } | string> };

type CatalogStatus = "demo" | "live" | "offline";
type SortValue = "featured" | "newest" | "price_asc" | "price_desc" | "rating" | "name" | "discount";

const catalogApiTimeoutMs = 12000;
const debounceMs = 350;

function useQueryState(enabled: boolean) {
  const router = useRouter();
  const [params, setParamsState] = useState<URLSearchParams>(
    () => new URLSearchParams(enabled && typeof window !== "undefined" ? window.location.search : "")
  );

  useEffect(() => {
    if (!enabled) return;
    const sync = () => setParamsState(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [enabled]);

  const setParams = useCallback(
    (next: Record<string, string | undefined>, options?: { replace?: boolean }) => {
      if (!enabled || typeof window === "undefined") return;
      const url = new URL(window.location.href);
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === "") {
          url.searchParams.delete(key);
        } else {
          url.searchParams.set(key, value);
        }
      }
      const href = `${url.pathname}${url.search}`;
      if (options?.replace) {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
      setParamsState(new URLSearchParams(url.search));
    },
    [enabled, router]
  );

  return [params, setParams] as const;
}

export function ProductGrid({
  compact = false,
  fixedCategory,
  excludeSlug,
  initialFlag = "",
  initialSort,
  heading,
  eyebrow,
  description,
  pageSize = 12,
  fallbackProducts,
  onProductOpen
}: {
  compact?: boolean;
  fixedCategory?: string;
  excludeSlug?: string;
  initialFlag?: "featured" | "deal" | "new" | "";
  initialSort?: SortValue;
  heading?: string;
  eyebrow?: string;
  description?: string;
  pageSize?: number;
  /** Optional catalog to show if the live API is unreachable. A generic default skin ships no hardcoded products - pass your own (or omit for an empty offline state). */
  fallbackProducts?: Product[];
  onProductOpen?: (event: MouseEvent<HTMLAnchorElement>, product: Product) => void;
}) {
  const syncUrl = !compact;
  const { apiBaseUrl } = useStorefrontConfig();
  const { locale, t } = useLanguage();
  const { addItem } = useCart();
  const { favorites, toggleFavorite: toggleFavoriteContext } = useFavorites();
  const [urlParams, setUrlParams] = useQueryState(syncUrl);

  const [queryInput, setQueryInput] = useState(() => urlParams.get("q") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(queryInput);
  const [sort, setSort] = useState<SortValue>(() => (urlParams.get("sort") as SortValue) || initialSort || "featured");
  const [category, setCategory] = useState(() => fixedCategory ?? urlParams.get("category") ?? "");
  const [brand, setBrand] = useState(() => urlParams.get("brand") ?? "");
  const [minPrice, setMinPrice] = useState(() => urlParams.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState(() => urlParams.get("maxPrice") ?? "");
  const [minRating, setMinRating] = useState(() => urlParams.get("minRating") ?? "");
  const [hasDiscount, setHasDiscount] = useState(() => urlParams.get("hasDiscount") === "1");
  const [inStock, setInStock] = useState(() => urlParams.get("inStock") === "1");
  const [page, setPage] = useState(() => Number(urlParams.get("page") ?? 1) || 1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [flag] = useState<"featured" | "deal" | "new" | "">(initialFlag);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<CatalogStatus>("demo");
  const [statusMessage, setStatusMessage] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<Array<{ slug: string; name: string }>>([]);
  const [addingIds, setAddingIds] = useState<string[]>([]);
  const [addedProduct, setAddedProduct] = useState<Product | null>(null);
  const [notifiedIds, setNotifiedIds] = useState<string[]>([]);
  const [pagination, setPagination] = useState<ApiPagination>({ page: 1, pageSize, total: 0, pageCount: 1 });

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(queryInput.trim()), debounceMs);
    return () => window.clearTimeout(timeout);
  }, [queryInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, sort, category, brand, minPrice, maxPrice, minRating, hasDiscount, inStock]);

  useEffect(() => {
    if (!syncUrl) return;
    setUrlParams(
      {
        q: debouncedQuery || undefined,
        sort: sort !== "featured" ? sort : undefined,
        category: category || undefined,
        brand: brand || undefined,
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
        minRating: minRating || undefined,
        hasDiscount: hasDiscount ? "1" : undefined,
        inStock: inStock ? "1" : undefined,
        page: page > 1 ? String(page) : undefined
      },
      { replace: true }
    );
  }, [debouncedQuery, sort, category, brand, minPrice, maxPrice, minRating, hasDiscount, inStock, page, syncUrl, setUrlParams]);

  useEffect(() => {
    if (compact || fixedCategory) return;
    Promise.all([
      fetch(`${apiBaseUrl}/api/v1/catalog/brands`).then((response) => response.json() as Promise<ApiList>),
      fetch(`${apiBaseUrl}/api/v1/catalog/categories`).then((response) => response.json() as Promise<{ success: boolean; data?: Array<{ slug: string; name: string }> }>)
    ])
      .then(([brandsPayload, categoriesPayload]) => {
        if (brandsPayload.success) setBrands(brandsPayload.data.map((entry) => (typeof entry === "string" ? entry : entry.name)));
        if (categoriesPayload.success && categoriesPayload.data) setCategories(categoriesPayload.data);
      })
      .catch(() => undefined);
  }, [compact, fixedCategory, apiBaseUrl]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), catalogApiTimeoutMs);
    setLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sort: flag === "new" ? "newest" : flag === "deal" ? "discount" : sort
    });
    if (debouncedQuery) params.set("search", debouncedQuery);
    if (flag) params.set("flag", flag);
    const effectiveCategory = fixedCategory ?? category;
    if (effectiveCategory) params.set("category", effectiveCategory);
    if (brand) params.set("brand", brand);
    if (minPrice) params.set("minPrice", String(Math.max(0, Math.round(Number(minPrice) * 100))));
    if (maxPrice) params.set("maxPrice", String(Math.max(0, Math.round(Number(maxPrice) * 100))));
    if (minRating) params.set("minRating", minRating);
    if (hasDiscount) params.set("hasDiscount", "true");
    if (inStock) params.set("inStock", "true");

    fetch(`${apiBaseUrl}/api/v1/catalog/products?${params.toString()}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload: ApiProducts) => {
        if (!payload.success) return;
        const data = excludeSlug ? payload.data.filter((product) => product.slug !== excludeSlug) : payload.data;
        setProducts(data);
        setPagination(payload.pagination ?? { page, pageSize, total: data.length, pageCount: 1 });
        setStatus("live");
        setStatusMessage("");
      })
      .catch(() => {
        setStatus("offline");
        setStatusMessage("");
        if (!compact && fallbackProducts) setProducts(fallbackProducts);
      })
      .finally(() => setLoading(false));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [compact, page, pageSize, sort, debouncedQuery, flag, fixedCategory, category, brand, minPrice, maxPrice, minRating, hasDiscount, inStock, excludeSlug, apiBaseUrl, fallbackProducts]);

  const favoriteIds = useMemo(() => favorites.map((product) => product.id), [favorites]);

  const sortOptions: Array<{ value: SortValue; label: string }> = useMemo(
    () => [
      { value: "featured", label: t.sortFeatured },
      { value: "price_asc", label: t.sortPriceAsc },
      { value: "price_desc", label: t.sortPriceDesc },
      { value: "rating", label: t.sortRating },
      { value: "discount", label: t.sortDiscount },
      { value: "name", label: t.sortName },
      { value: "newest", label: t.sortNewest }
    ],
    [t]
  );

  async function addToCart(product: Product) {
    if (addingIds.includes(product.id)) return;
    setAddingIds((current) => [...current, product.id]);
    try {
      const result = await addItem(product);
      setAddedProduct(product);
      setStatusMessage(
        locale === "es"
          ? result === "synced"
            ? `${product.name} agregado al carrito`
            : `${product.name} guardado localmente`
          : result === "synced"
            ? `${product.name} added to cart`
            : `${product.name} saved locally`
      );
      window.setTimeout(() => setAddedProduct((current) => (current?.id === product.id ? null : current)), 3200);
    } finally {
      setAddingIds((current) => current.filter((id) => id !== product.id));
    }
  }

  function toggleFavorite(product: Product) {
    toggleFavoriteContext(product);
  }

  async function notifyRestock(product: Product) {
    const email = window.prompt(t.notifyPromptEmail)?.trim();
    if (!email) return;
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/catalog/products/${encodeURIComponent(product.id)}/notify-restock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (!response.ok) throw new Error("notify-restock request failed");
      setNotifiedIds((current) => (current.includes(product.id) ? current : [...current, product.id]));
    } catch {
      window.alert(t.notifyFailed);
    }
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
    if (!compact) {
      window.requestAnimationFrame(() => {
        document.getElementById("catalog-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  function clearFilters() {
    setQueryInput("");
    setSort(initialSort ?? "featured");
    if (!fixedCategory) setCategory("");
    setBrand("");
    setMinPrice("");
    setMaxPrice("");
    setMinRating("");
    setHasDiscount(false);
    setInStock(false);
  }

  const hasActiveFilters = Boolean(
    debouncedQuery || (!fixedCategory && category) || brand || minPrice || maxPrice || minRating || hasDiscount || inStock
  );

  const filterPanel = (
    <div className="grid gap-4">
      {!fixedCategory ? (
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-zinc-950">{t.category}</span>
          <Select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">{t.all}</option>
            {categories.map((entry) => (
              <option key={entry.slug} value={entry.slug}>
                {entry.name}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium text-zinc-950">{t.brandLabel}</span>
        <Select value={brand} onChange={(event) => setBrand(event.target.value)}>
          <option value="">{t.allBrands}</option>
          {brands.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </Select>
      </label>
      <div className="grid gap-1.5 text-sm">
        <span className="font-medium text-zinc-950">{t.priceRange}</span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            inputMode="decimal"
            placeholder={t.minPrice}
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
            aria-label={t.minPrice}
          />
          <span className="text-zinc-500">-</span>
          <Input
            type="number"
            min={0}
            inputMode="decimal"
            placeholder={t.maxPrice}
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
            aria-label={t.maxPrice}
          />
        </div>
      </div>
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium text-zinc-950">{t.minRating}</span>
        <Select value={minRating} onChange={(event) => setMinRating(event.target.value)}>
          <option value="">{t.anyRating}</option>
          {[4.5, 4, 3.5, 3].map((value) => (
            <option key={value} value={value}>
              {value}+
            </option>
          ))}
        </Select>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-950">
        <input type="checkbox" checked={hasDiscount} onChange={(event) => setHasDiscount(event.target.checked)} className="h-4 w-4" />
        {t.onlyDiscounted}
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-950">
        <input type="checkbox" checked={inStock} onChange={(event) => setInStock(event.target.checked)} className="h-4 w-4" />
        {t.onlyInStock}
      </label>
      {hasActiveFilters ? (
        <Button type="button" variant="outline" onClick={clearFilters}>
          {t.clearFilters}
        </Button>
      ) : null}
    </div>
  );

  return (
    <section className={compact ? "aether-shell py-8" : "aether-shell py-8"} aria-labelledby="catalog-heading">
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase text-accent">
          {eyebrow ?? (statusMessage || (status === "live" ? t.liveCatalog : status === "offline" ? t.offlineCatalog : t.demoReady))}
        </p>
        <h2 id="catalog-heading" className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950 md:text-4xl">
          {heading ?? t.premiumCatalog}
        </h2>
        {description ? <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600">{description}</p> : null}
      </div>

      {!compact ? (
        <div className="mb-5 grid gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <label className="focus-within:ring-3 flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 bg-zinc-50 px-3 text-sm">
            <Search size={17} aria-hidden />
            <span className="sr-only">{t.searchProducts}</span>
            <input
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setDebouncedQuery(queryInput.trim());
              }}
              className="w-full min-w-0 border-0 bg-transparent text-zinc-950 outline-none placeholder:text-zinc-500"
              placeholder={t.searchPlaceholder}
            />
            {queryInput ? (
              <button type="button" onClick={() => setQueryInput("")} aria-label="Clear search" className="focus-ring rounded p-1 text-zinc-500 hover:text-zinc-950">
                <X size={15} aria-hidden />
              </button>
            ) : null}
          </label>
          <Select value={sort} onChange={(event) => setSort(event.target.value as SortValue)} aria-label={t.sortBy} className="sm:w-56">
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {t.sortBy}: {option.label}
              </option>
            ))}
          </Select>
          <Button type="button" variant="outline" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal size={16} aria-hidden />
            {t.filters}
            {hasActiveFilters ? <Badge tone="accent">•</Badge> : null}
          </Button>
        </div>
      ) : null}

      <div className={compact ? "" : "grid gap-6 lg:grid-cols-[240px_1fr]"}>
        {!compact ? (
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-950">
                <SlidersHorizontal size={16} aria-hidden />
                {t.filters}
              </h3>
              {filterPanel}
            </div>
          </aside>
        ) : null}

        <div>
          {!compact ? (
            <p className="mb-3 text-sm text-zinc-600">{t.resultsCount.replace("{count}", String(pagination.total))}</p>
          ) : null}

          {loading && products.length === 0 ? (
            <div className={`grid gap-4 sm:grid-cols-2 ${compact ? "lg:grid-cols-4" : "lg:grid-cols-3 xl:grid-cols-4"}`}>
              {Array.from({ length: compact ? 4 : pageSize }).map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          ) : !loading && products.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center">
              <p className="text-lg font-semibold text-zinc-950">{t.noResultsTitle}</p>
              <p className="mt-2 text-sm text-zinc-600">{t.noResultsDescription}</p>
              {hasActiveFilters ? (
                <Button type="button" variant="outline" className="mt-4" onClick={clearFilters}>
                  {t.clearFilters}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className={`grid gap-4 sm:grid-cols-2 ${compact ? "lg:grid-cols-4" : "lg:grid-cols-3 xl:grid-cols-4"}`}>
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  isFavorite={favoriteIds.includes(product.id)}
                  isAdding={addingIds.includes(product.id)}
                  isAdded={addedProduct?.id === product.id}
                  onToggleFavorite={toggleFavorite}
                  onAddToCart={(item) => void addToCart(item)}
                  onNotifyRestock={(item) => void notifyRestock(item)}
                  isNotifySubscribed={notifiedIds.includes(product.id)}
                  {...(onProductOpen ? { onOpenProduct: onProductOpen } : {})}
                />
              ))}
            </div>
          )}

          {!compact && pagination.pageCount > 1 ? (
            <div className="mt-6 flex flex-col gap-3 border-t border-zinc-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-zinc-600">
                {t.pageOf.replace("{page}", String(pagination.page)).replace("{pageCount}", String(Math.max(1, pagination.pageCount)))}
              </p>
              <div className="flex gap-3">
                {pagination.page > 1 ? (
                  <Button type="button" variant="outline" onClick={() => goToPage(Math.max(1, page - 1))}>
                    {t.previousPage}
                  </Button>
                ) : null}
                {pagination.page < pagination.pageCount ? (
                  <Button type="button" onClick={() => goToPage(Math.min(Math.max(1, pagination.pageCount), page + 1))}>
                    {t.nextPage}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {!compact ? (
        <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} side="bottom" title={t.filters}>
          {filterPanel}
          <Button type="button" className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>
            {t.applyFilters}
          </Button>
        </Sheet>
      ) : null}

      {addedProduct ? (
        <div
          className="fixed bottom-5 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border border-emerald-500/40 bg-white p-4 shadow-xl"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-emerald-600 text-white">
              <Check size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-zinc-950">{locale === "es" ? "Agregado al carrito" : "Added to cart"}</p>
              <p className="truncate text-sm text-zinc-600">{addedProduct.name}</p>
            </div>
            <StorefrontLink href="/cart" className="focus-ring shrink-0 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white">
              {t.cart}
            </StorefrontLink>
          </div>
        </div>
      ) : null}
    </section>
  );
}
