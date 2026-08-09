"use client";

import { useEffect, useState } from "react";
import { CreditCard, Minus, Plus, RotateCcw, ShoppingBag, Ticket, Trash2 } from "lucide-react";
import { formatUsd } from "@aether/core";
import type { Cart, Product } from "@aether/schemas";
import { Badge, Button } from "@aether/ui";
import { apiBaseUrl, storefrontPath } from "../../components/config";
import {
  getCartId,
  applyCartCoupon,
  readLocalCart,
  readLocalCartItems,
  removeProductFromCart,
  syncLocalCartToApi,
  updateCartItemQuantity,
  getCartToken
} from "../../components/cart-client";
import { useCustomerSession } from "../../components/customer-client";
import { useLanguage } from "../../components/LanguageProvider";

type CheckoutPayload = {
  success: boolean;
  data?: { checkoutUrl: string };
  error?: { code: string; message: string };
};

export default function CartPage() {
  const { locale, t } = useLanguage();
  const { customer } = useCustomerSession();
  const [cart, setCart] = useState<Cart | null>(null);
  const [status, setStatus] = useState<string>(t.loadingCart);
  const [isLoading, setIsLoading] = useState(true);
  const [stockBySlug, setStockBySlug] = useState<Record<string, number>>({});
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  async function refresh() {
    const id = getCartId();
    const localCart = readLocalCart(id);
    const hasLocalItems = localCart.items.length > 0;

    if (hasLocalItems) {
      setCart(localCart);
      setStatus(t.cartSavedLocal);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    try {
      const token = await getCartToken();
      const fetchServerCart = () =>
        fetch(`${apiBaseUrl}/api/v1/cart/${id}`, {
          headers: token ? { "x-aether-cart-token": token } : {}
        });

      let response = await fetchServerCart();
      let payload = (await response.json()) as { success: boolean; data?: Cart };
      if (!response.ok || !payload.success) {
        throw new Error("Cart API rejected read.");
      }

      if (!payload.data?.items.length && hasLocalItems) {
        // The add-to-cart call that created these items likely timed out
        // before reaching the server. Push them now instead of waiting for
        // checkout, so the server cart (and anything reading it, like the
        // AI assistant) reflects what the shopper actually has.
        await syncLocalCartToApi();
        response = await fetchServerCart();
        payload = (await response.json()) as { success: boolean; data?: Cart };
        if (!response.ok || !payload.success) {
          throw new Error("Cart API rejected read.");
        }
      }

      const nextCart = payload.data?.items.length ? payload.data : localCart.items.length ? localCart : payload.data;
      setCart(nextCart ?? null);
      setStatus(payload.data?.items.length ? t.cartSynced : localCart.items.length ? t.cartSavedLocal : t.cartUnavailable);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh().catch(() => {
      const localCart = readLocalCart();
      setCart(localCart);
      setStatus(localCart.items.length ? t.cartSavedLocal : t.startApiSyncCart);
      setIsLoading(false);
    });
    // Intentionally runs once on mount only - refresh() is stable across renders.
  }, []);

  useEffect(() => {
    const slugs = [...new Set((cart?.items ?? []).map((item) => item.slug))];
    if (slugs.length === 0) return;
    let cancelled = false;

    void Promise.all(
      slugs.map((slug) =>
        fetch(`${apiBaseUrl}/api/v1/catalog/products/${slug}`)
          .then((response) => response.json())
          .then((payload: { success: boolean; data?: Product }) => [slug, payload.data?.availableStock ?? null] as const)
          .catch(() => [slug, null] as const)
      )
    ).then((entries) => {
      if (cancelled) return;
      setStockBySlug(Object.fromEntries(entries.filter(([, stock]) => stock !== null)) as Record<string, number>);
    });

    return () => {
      cancelled = true;
    };
  }, [cart?.items]);

  async function applyCoupon() {
    try {
      await applyCartCoupon("AETHER10");
      await refresh();
    } catch {
      setStatus(t.startApiApplyCoupon);
    }
  }

  async function createCheckoutSession() {
    const id = getCartId();
    const response = await fetch(`${apiBaseUrl}/api/v1/checkout/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cartId: id })
    });
    return (await response.json()) as CheckoutPayload;
  }

  async function checkout() {
    if (!customer) {
      window.location.href = storefrontPath("/register?next=/cart&checkout=1");
      return;
    }

    setStatus(t.preparingCheckout);

    try {
      let payload = await createCheckoutSession();

      if (!payload.success && payload.error?.code === "EMPTY_CART" && readLocalCartItems().length > 0) {
        setStatus(t.syncingCartCheckout);
        await syncLocalCartToApi();
        payload = await createCheckoutSession();
      }

      if (payload.success && payload.data?.checkoutUrl) {
        window.location.href = payload.data.checkoutUrl;
        return;
      }

      setStatus(payload.error?.message ?? t.checkoutFailed);
    } catch {
      setStatus(t.startApiCheckout);
    }
  }

  async function removeItem(itemId: string, itemName: string) {
    const result = await removeProductFromCart(itemId);
    const localCart = readLocalCart();
    setCart(localCart);
    setStatus(`${itemName} ${result === "synced" ? t.removedFromCart : t.removedLocally}`);
  }

  async function changeQuantity(itemId: string, nextQuantity: number, stock: number | undefined) {
    if (nextQuantity < 1) return;
    const capped = stock !== undefined ? Math.min(nextQuantity, Math.max(1, stock)) : nextQuantity;
    setPendingItemId(itemId);
    try {
      await updateCartItemQuantity(itemId, capped);
      setCart(readLocalCart());
    } finally {
      setPendingItemId(null);
    }
  }

  const items = cart?.items ?? [];

  return (
    <main className="aether-shell py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-accent">{status}</p>
          <h1 className="mt-1 text-4xl font-semibold text-zinc-950">{t.cart}</h1>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={isLoading}>
          <RotateCcw size={17} aria-hidden />
          {isLoading ? t.refreshing : t.refresh}
        </Button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border border-zinc-200 bg-white">
          {isLoading ? (
            <div className="grid gap-4 p-4" aria-label={t.loadingCart}>
              {[0, 1].map((item) => (
                <div key={item} className="flex animate-pulse gap-4">
                  <div className="h-20 w-20 rounded-md bg-zinc-200" />
                  <div className="min-w-0 flex-1 space-y-3 py-2">
                    <div className="h-4 w-2/3 rounded bg-zinc-200" />
                    <div className="h-3 w-24 rounded bg-zinc-200" />
                  </div>
                  <div className="h-4 w-16 rounded bg-zinc-200" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="grid place-items-center gap-3 p-10 text-center">
              <ShoppingBag size={32} className="text-zinc-400" aria-hidden />
              <p className="text-zinc-600">{t.emptyCart}</p>
              <a href={storefrontPath("/products")} className="focus-ring inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-white">
                {t.browseProducts}
              </a>
            </div>
          ) : (
            items.map((item) => {
              const itemId = item.slug;
              const stock = stockBySlug[item.slug];
              const outOfStock = stock === 0;
              const overStock = typeof stock === "number" && item.quantity > stock;
              const isPending = pendingItemId === itemId;

              return (
                <div key={`${item.productId}-${item.variantId}`} className="flex gap-4 border-b border-zinc-200 p-4 last:border-b-0">
                  <a href={storefrontPath(`/products/detail?slug=${encodeURIComponent(item.slug)}`)} className="shrink-0">
                    <img src={item.imageUrl} alt={item.name} className="h-20 w-20 rounded-md border border-zinc-200 bg-zinc-50 object-contain p-1" />
                  </a>
                  <div className="min-w-0 flex-1">
                    <a href={storefrontPath(`/products/detail?slug=${encodeURIComponent(item.slug)}`)} className="font-semibold text-zinc-950 hover:text-accent">
                      {item.name}
                    </a>
                    <p className="mt-1 text-sm text-zinc-500">
                      {formatUsd(item.finalUnitPrice, locale === "es" ? "es-CO" : "en-US")} {t.qty.toLowerCase()}
                    </p>
                    {outOfStock ? (
                      <Badge tone="danger" className="mt-2">
                        {t.cartItemOutOfStock}
                      </Badge>
                    ) : overStock ? (
                      <Badge tone="warning" className="mt-2">
                        {t.cartQuantityExceedsStock.replace("{count}", String(stock))}
                      </Badge>
                    ) : null}
                    <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-zinc-300">
                      <button
                        type="button"
                        onClick={() => void changeQuantity(itemId, item.quantity - 1, stock)}
                        disabled={isPending || item.quantity <= 1}
                        aria-label={locale === "es" ? "Reducir cantidad" : "Decrease quantity"}
                        className="focus-ring grid h-9 w-9 place-items-center text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
                      >
                        <Minus size={14} aria-hidden />
                      </button>
                      <span className="min-w-6 text-center text-sm font-semibold text-zinc-950" aria-live="polite">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => void changeQuantity(itemId, item.quantity + 1, stock)}
                        disabled={isPending || (typeof stock === "number" && item.quantity >= stock)}
                        aria-label={locale === "es" ? "Aumentar cantidad" : "Increase quantity"}
                        className="focus-ring grid h-9 w-9 place-items-center text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
                      >
                        <Plus size={14} aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="grid justify-items-end gap-3">
                    <strong className="text-zinc-950">{formatUsd(item.lineTotal, locale === "es" ? "es-CO" : "en-US")}</strong>
                    <button
                      type="button"
                      onClick={() => void removeItem(item.slug, item.name)}
                      className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
                      aria-label={locale === "es" ? `Eliminar ${item.name} del carrito` : `Remove ${item.name} from cart`}
                    >
                      <Trash2 size={16} aria-hidden />
                      {t.remove}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </section>
        <aside className="h-fit rounded-lg border border-zinc-200 bg-white p-5 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold text-zinc-950">{t.summary}</h2>
          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex justify-between"><dt>{t.subtotal}</dt><dd>{formatUsd(cart?.totals.subtotal ?? 0, locale === "es" ? "es-CO" : "en-US")}</dd></div>
            <div className="flex justify-between"><dt>{t.discount}</dt><dd>-{formatUsd(cart?.totals.discount ?? 0, locale === "es" ? "es-CO" : "en-US")}</dd></div>
            <div className="flex justify-between"><dt>{t.shipping}</dt><dd>{formatUsd(cart?.totals.shipping ?? 0, locale === "es" ? "es-CO" : "en-US")}</dd></div>
            <div className="flex justify-between border-t border-zinc-200 pt-3 text-base font-semibold"><dt>{t.total}</dt><dd>{formatUsd(cart?.totals.total ?? 0, locale === "es" ? "es-CO" : "en-US")}</dd></div>
          </dl>
          <div className="mt-5 grid gap-3">
            <Button type="button" variant="outline" onClick={() => void applyCoupon()} disabled={items.length === 0}>
              <Ticket size={17} aria-hidden />
              {t.applyCoupon}
            </Button>
            <Button type="button" onClick={() => void checkout()} disabled={items.length === 0}>
              <CreditCard size={17} aria-hidden />
              {t.checkoutSandbox}
            </Button>
          </div>
        </aside>
      </div>
    </main>
  );
}
