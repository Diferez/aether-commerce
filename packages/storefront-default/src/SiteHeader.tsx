"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Heart, Menu, Scale, Search, Settings2, ShoppingCart, Sparkles, UserRound, X } from "lucide-react";
import type { BrandSettings } from "@aether/core";
import { Badge } from "@aether/ui";
import { useStorefrontConfig, useStorefrontPath } from "./AetherStorefrontProvider";
import { createCartClient } from "./cart-client";
import { readCompareProducts } from "./compare-client";
import { useCustomerSession } from "./customer-client";
import { readFavoriteProducts } from "./favorites-client";
import { useLanguage } from "./LanguageProvider";
import { StorefrontLink } from "./StorefrontLink";
import { ThemeToggle } from "./ThemeToggle";

const brandCacheKey = "aether.brand.v1";

function useQueryParam(name: string) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const sync = () => setValue(new URLSearchParams(window.location.search).get(name) ?? "");
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [name]);
  return value;
}

export function SiteHeader({ portfolioUrl }: { portfolioUrl?: string }) {
  const { locale, setLocale, t } = useLanguage();
  const router = useRouter();
  const { apiBaseUrl } = useStorefrontConfig();
  const storefrontPath = useStorefrontPath();
  const cartClient = useMemo(() => createCartClient(apiBaseUrl), [apiBaseUrl]);
  const { customer, isLoaded: customerLoaded } = useCustomerSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [compareCount, setCompareCount] = useState(0);
  const [brand, setBrand] = useState<BrandSettings | null>(null);
  const initialQuery = useQueryParam("q");
  const [searchValue, setSearchValue] = useState(initialQuery);

  // Applying primaryColor as CSS custom properties (rather than, say, an
  // inline style per component) re-themes every existing bg-accent/
  // text-accent/border-accent usage across the whole storefront at once -
  // those Tailwind utilities are generated from --color-accent* in
  // globals.css. color-mix() derives the hover/soft shades from whatever
  // color the client picks instead of needing a JS color-math dependency.
  function applyBrand(data: BrandSettings) {
    setBrand(data);
    const root = document.documentElement.style;
    root.setProperty("--color-accent", data.primaryColor);
    root.setProperty("--color-accent-hover", `color-mix(in srgb, ${data.primaryColor} 85%, black)`);
    root.setProperty("--color-accent-soft", `color-mix(in srgb, ${data.primaryColor} 12%, transparent)`);
  }

  // The real brand (logo, name, color) only arrives once this fetch
  // resolves, so every reload briefly showed the generic Sparkles glyph
  // first. Restoring last-known values from localStorage before the first
  // paint (useLayoutEffect, not useEffect) removes that flash on repeat
  // visits - same technique already used for the cart badge below - while
  // the fetch still runs underneath to pick up any real change.
  useLayoutEffect(() => {
    try {
      const cached = window.localStorage.getItem(brandCacheKey);
      if (cached) applyBrand(JSON.parse(cached) as BrandSettings);
    } catch {
      // Ignore malformed/inaccessible cache - the fetch below still runs.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${apiBaseUrl}/api/v1/brand`)
      .then((response) => response.json())
      .then((payload: { success: boolean; data?: BrandSettings }) => {
        if (cancelled || !payload.success || !payload.data) return;
        applyBrand(payload.data);
        try {
          window.localStorage.setItem(brandCacheKey, JSON.stringify(payload.data));
        } catch {
          // Storage may be unavailable (private browsing, quota) - non-fatal.
        }
      })
      .catch(() => {
        // Default Aether name/theme stays in place if this read fails.
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    setSearchValue(initialQuery);
  }, [initialQuery]);

  // Cart isn't customer-scoped, so it can sync as soon as we mount - no need
  // to wait on anything. useLayoutEffect (not useEffect) applies it before
  // the browser paints, so the badge is correct on the very first frame
  // instead of popping in a beat later.
  useLayoutEffect(() => {
    const syncCart = () => setCartCount(cartClient.readLocalCartItems().reduce((sum, item) => sum + item.quantity, 0));
    syncCart();
    window.addEventListener("aether-cart-changed", syncCart);
    return () => window.removeEventListener("aether-cart-changed", syncCart);
  }, [cartClient]);

  // Not customer-scoped (see compare-client.ts), so like the cart badge it
  // can sync immediately too - no Clerk session to wait on.
  useLayoutEffect(() => {
    const syncCompare = () => setCompareCount(readCompareProducts().length);
    syncCompare();
    window.addEventListener("aether-compare-changed", syncCompare);
    return () => window.removeEventListener("aether-compare-changed", syncCompare);
  }, []);

  // Favorites ARE customer-scoped (guest bucket vs. that customer's own
  // bucket), and Clerk resolves the real session asynchronously. Wait for
  // customerLoaded before reading favorites at all, instead of reading the
  // guest bucket first and then re-reading the customer's bucket once Clerk
  // catches up - that two-step read is what was showing a different count
  // for a moment, i.e. the header "changing twice" on every navigation.
  useLayoutEffect(() => {
    if (!customerLoaded) return;
    const syncFavorites = () => setFavoriteCount(readFavoriteProducts(customer?.id ?? null).length);
    syncFavorites();
    window.addEventListener("aether-favorites-changed", syncFavorites);
    return () => window.removeEventListener("aether-favorites-changed", syncFavorites);
  }, [customerLoaded, customer]);

  const accountPending = !customerLoaded;
  const accountHref = customer ? "/account" : "/login";
  const accountLabel = customer ? customer.name.split(" ")[0] : t.signIn;

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const target = new URL(storefrontPath("/search"), window.location.origin);
    if (searchValue.trim()) target.searchParams.set("q", searchValue.trim());
    router.push(`${target.pathname}${target.search}`);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.08)] backdrop-blur">
      <div className="aether-shell flex min-h-16 items-center justify-between gap-3">
        <StorefrontLink className="flex shrink-0 items-center gap-3 font-semibold" href="/">
          {brand?.logoUrl ? (
            // Plain <img>, not next/image - the URL is admin-configured at
            // runtime, not a build-time known asset next/image can optimize.
            <img
              src={brand.logoUrl}
              alt={brand.name}
              className="h-9 w-9 rounded-md object-contain"
            />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-md bg-accent text-white">
              <Sparkles size={18} aria-hidden />
            </span>
          )}
          <span className="hidden sm:block">
            <span className="block text-base leading-tight">{brand?.name || t.brand}</span>
            <span className="block text-xs font-normal text-ink-muted">
              {brand?.tagline[locale] || t.tagline}
            </span>
          </span>
        </StorefrontLink>

        <form onSubmit={submitSearch} className="hidden min-w-0 flex-1 max-w-lg lg:flex">
          <label className="focus-within:ring-3 flex min-h-11 w-full items-center gap-2 rounded-md border border-border bg-surface-hover px-3 text-sm">
            <Search size={16} aria-hidden className="shrink-0 text-ink-subtle" />
            <span className="sr-only">{t.searchProducts}</span>
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full min-w-0 border-0 bg-transparent text-ink outline-none placeholder:text-ink-subtle"
            />
          </label>
        </form>

        <nav className="hidden shrink-0 items-center gap-1 md:flex" aria-label="Primary">
          <StorefrontLink href="/products" className="focus-ring inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-ink-muted hover:bg-surface-hover hover:text-ink">
            {t.shop}
          </StorefrontLink>
          <StorefrontLink href="/categories" className="focus-ring inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-ink-muted hover:bg-surface-hover hover:text-ink">
            {t.categories}
          </StorefrontLink>
          <StorefrontLink
            href="/account/favorites"
            className="focus-ring relative inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-ink-muted hover:bg-surface-hover hover:text-ink"
            aria-label={t.favorites}
          >
            <Heart size={17} aria-hidden />
            {/* Always rendered (never conditionally omitted) so this slot's
                width is reserved from the very first paint - favoriteCount
                starts at 0 until the layout effect resolves it, and if the
                badge only mounted once count > 0, its appearance would widen
                the nav and shift everything after it. */}
            <Badge tone="accent" className={favoriteCount > 0 ? "" : "invisible"}>
              {favoriteCount}
            </Badge>
          </StorefrontLink>
          <StorefrontLink
            href="/compare"
            className="focus-ring relative inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-ink-muted hover:bg-surface-hover hover:text-ink"
            aria-label={t.compareProducts}
          >
            <Scale size={17} aria-hidden />
            <Badge tone="accent" className={compareCount > 0 ? "" : "invisible"}>
              {compareCount}
            </Badge>
          </StorefrontLink>
          <StorefrontLink
            href="/cart"
            className="focus-ring relative inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-ink-muted hover:bg-surface-hover hover:text-ink"
            aria-label={t.cart}
          >
            <ShoppingCart size={17} aria-hidden />
            <Badge tone="accent" className={cartCount > 0 ? "" : "invisible"}>
              {cartCount}
            </Badge>
          </StorefrontLink>
        </nav>

        <SettingsMenu locale={locale} setLocale={setLocale} {...(portfolioUrl !== undefined ? { portfolioUrl } : {})} />
        {accountPending ? (
          <span
            aria-hidden="true"
            className="hidden min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-ink lg:inline-flex"
          >
            <UserRound size={16} aria-hidden />
            <span className="h-4 w-14 rounded bg-surface-hover" />
          </span>
        ) : (
          <StorefrontLink
            href={accountHref}
            className="focus-ring hidden min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-ink hover:bg-surface-hover lg:inline-flex"
          >
            <UserRound size={16} aria-hidden />
            {accountLabel}
          </StorefrontLink>
        )}

        <button
          type="button"
          onClick={() => setSearchOpen((value) => !value)}
          className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-ink hover:bg-surface-hover lg:hidden"
          aria-expanded={searchOpen}
          aria-label={t.searchProducts}
        >
          <Search size={19} aria-hidden />
        </button>
        <StorefrontLink
          href="/cart"
          onClick={(event) => {
            // With items, open the quick-view drawer (FloatingCart) instead
            // of navigating away - keeps the shopper on the page they're
            // browsing. An empty cart has nothing to show there, so this
            // falls through to the normal /cart navigation instead.
            if (cartCount > 0) {
              event.preventDefault();
              window.dispatchEvent(new Event("aether-open-cart"));
            }
          }}
          className="focus-ring relative inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-ink hover:bg-surface-hover md:hidden"
          aria-label={t.cart}
        >
          <ShoppingCart size={19} aria-hidden />
          {cartCount > 0 ? (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
              {cartCount}
            </span>
          ) : null}
        </StorefrontLink>
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-ink hover:bg-surface-hover md:hidden"
          aria-expanded={menuOpen}
          aria-controls="aether-mobile-menu"
          aria-label={menuOpen ? "Cerrar menu" : "Abrir menu"}
        >
          {menuOpen ? <X size={19} aria-hidden /> : <Menu size={19} aria-hidden />}
        </button>
      </div>

      {searchOpen ? (
        <div className="border-t border-border bg-surface px-3 py-3 lg:hidden">
          <form onSubmit={submitSearch} className="aether-shell">
            <label className="focus-within:ring-3 flex min-h-11 w-full items-center gap-2 rounded-md border border-border bg-surface-hover px-3 text-sm">
              <Search size={16} aria-hidden className="shrink-0 text-ink-subtle" />
              <span className="sr-only">{t.searchProducts}</span>
              <input
                autoFocus
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full min-w-0 border-0 bg-transparent text-ink outline-none placeholder:text-ink-subtle"
              />
            </label>
          </form>
        </div>
      ) : null}

      {menuOpen ? (
        <div id="aether-mobile-menu" className="border-t border-border bg-surface md:hidden">
          <div className="aether-shell grid gap-3 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex w-fit items-center rounded-md border border-border bg-surface-hover p-1" aria-label={locale === "es" ? "Idioma" : "Language"}>
                <LanguageButtons locale={locale} setLocale={setLocale} />
              </div>
              <ThemeToggle />
            </div>
            <nav className="grid gap-2" aria-label="Mobile primary">
              <StorefrontLink
                href="/products"
                onClick={() => setMenuOpen(false)}
                className="focus-ring inline-flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                {t.shop}
              </StorefrontLink>
              <StorefrontLink
                href="/categories"
                onClick={() => setMenuOpen(false)}
                className="focus-ring inline-flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                {t.categories}
              </StorefrontLink>
              <StorefrontLink
                href="/account/favorites"
                onClick={() => setMenuOpen(false)}
                className="focus-ring inline-flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                <span className="inline-flex items-center gap-2">
                  <Heart size={17} aria-hidden />
                  {t.favorites}
                </span>
                {favoriteCount > 0 ? <Badge tone="accent">{favoriteCount}</Badge> : null}
              </StorefrontLink>
              <StorefrontLink
                href="/compare"
                onClick={() => setMenuOpen(false)}
                className="focus-ring inline-flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                <span className="inline-flex items-center gap-2">
                  <Scale size={17} aria-hidden />
                  {t.compareProducts}
                </span>
                {compareCount > 0 ? <Badge tone="accent">{compareCount}</Badge> : null}
              </StorefrontLink>
              <StorefrontLink
                href="/cart"
                onClick={() => setMenuOpen(false)}
                className="focus-ring inline-flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                <span className="inline-flex items-center gap-2">
                  <ShoppingCart size={17} aria-hidden />
                  {t.cart}
                </span>
                {cartCount > 0 ? <Badge tone="accent">{cartCount}</Badge> : null}
              </StorefrontLink>
            </nav>
            <div className="grid gap-2 sm:grid-cols-2">
              {accountPending ? (
                <span
                  aria-hidden="true"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent/70 px-3 text-sm font-semibold text-white"
                >
                  <UserRound size={17} aria-hidden />
                  <span className="h-4 w-16 rounded bg-white/25" />
                </span>
              ) : (
                <StorefrontLink
                  href={accountHref}
                  onClick={() => setMenuOpen(false)}
                  className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white"
                >
                  <UserRound size={17} aria-hidden />
                  {accountLabel}
                </StorefrontLink>
              )}
              {portfolioUrl ? (
                <a
                  href={portfolioUrl}
                  onClick={() => setMenuOpen(false)}
                  className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
                >
                  {t.portfolio}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function LanguageButtons({
  locale,
  setLocale
}: {
  locale: "en" | "es";
  setLocale: (locale: "en" | "es") => void;
}) {
  return (
    <>
      {(["en", "es"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          aria-label={option === "en" ? "Switch to English" : "Cambiar a espanol"}
          className={`min-h-8 rounded px-2 text-xs font-semibold ${locale === option ? "bg-accent-2 text-zinc-950" : "text-zinc-300"}`}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </>
  );
}

// Bundles language, theme, and the portfolio link (all low-frequency, "site
// preferences" style controls) behind a single trigger instead of three
// separate always-visible bordered buttons - that's what made the header
// feel crowded next to the actual shopping actions (cart, favorites, account).
function SettingsMenu({
  locale,
  setLocale,
  portfolioUrl
}: {
  locale: "en" | "es";
  setLocale: (locale: "en" | "es") => void;
  portfolioUrl?: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative hidden shrink-0 sm:block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.settings}
        className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium text-ink-muted hover:bg-surface-hover hover:text-ink"
      >
        <Settings2 size={16} aria-hidden />
        <span className="hidden xl:inline">{locale.toUpperCase()}</span>
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-56 rounded-lg border border-border bg-surface p-2 shadow-lg">
          <p className="px-2.5 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t.language}</p>
          <div className="grid grid-cols-2 gap-1 px-1 pb-2">
            {(["en", "es"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setLocale(option);
                  setOpen(false);
                }}
                aria-pressed={locale === option}
                className={`min-h-9 rounded-md text-sm font-semibold ${
                  locale === option ? "bg-accent text-white" : "text-ink-muted hover:bg-surface-hover"
                }`}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="my-1 h-px bg-border" />
          <ThemeToggle label={{ light: t.lightMode, dark: t.darkMode }} />

          {portfolioUrl ? (
            <>
              <div className="my-1 h-px bg-border" />
              <a
                href={portfolioUrl}
                role="menuitem"
                className="focus-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-ink hover:bg-surface-hover"
              >
                <ExternalLink size={16} aria-hidden />
                {t.viewPortfolio}
              </a>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
