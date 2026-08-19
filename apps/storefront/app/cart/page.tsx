"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, MessageCircle, Minus, Plus, RotateCcw, ShoppingBag, Ticket, Trash2 } from "lucide-react";
import { formatMoney } from "@aether/core";
import type { Cart, Product } from "@aether/schemas";
import { Badge, Button } from "@aether/ui";
import { apiBaseUrl, storefrontPath } from "../../components/config";
import {
  getCartId,
  applyCartCoupon,
  createCheckoutSession,
  readLocalCart,
  readLocalCartItems,
  removeProductFromCart,
  syncLocalCartToApi,
  updateCartItemQuantity,
  getCartCredentials
} from "../../components/cart-client";
import { buildCartWhatsappMessage, buildInquiryWhatsappMessage, buildWhatsappUrl } from "../../components/whatsapp-checkout";
import { useCheckoutOptions, useShippingSettings } from "../../components/checkout-options";
import { useAetherAuth } from "../../components/ClerkAuthProvider";
import { useCustomerSession } from "../../components/customer-client";
import { useLanguage } from "../../components/LanguageProvider";
import { StorefrontLink } from "../../components/StorefrontLink";

export default function CartPage() {
  const { locale, t } = useLanguage();
  const router = useRouter();
  const { customer } = useCustomerSession();
  const { getToken } = useAetherAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [status, setStatus] = useState<string>(t.loadingCart);
  const [isLoading, setIsLoading] = useState(true);
  const [stockBySlug, setStockBySlug] = useState<Record<string, number>>({});
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const checkoutOptions = useCheckoutOptions();
  const shippingSettings = useShippingSettings();

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
      const { cartId: serverCartId, token } = await getCartCredentials();
      const serverLocalCart = readLocalCart(serverCartId);
      const fetchServerCart = () =>
        fetch(`${apiBaseUrl}/api/v1/cart/${serverCartId}`, {
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

      const nextCart = payload.data?.items.length
        ? payload.data
        : serverLocalCart.items.length
          ? serverLocalCart
          : payload.data;
      setCart(nextCart ?? null);
      setStatus(
        payload.data?.items.length
          ? t.cartSynced
          : serverLocalCart.items.length
            ? t.cartSavedLocal
            : t.cartUnavailable
      );
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
          .then(
            (payload: { success: boolean; data?: Product }) =>
              [slug, payload.data?.availableStock ?? null] as const
          )
          .catch(() => [slug, null] as const)
      )
    ).then((entries) => {
      if (cancelled) return;
      setStockBySlug(
        Object.fromEntries(entries.filter(([, stock]) => stock !== null)) as Record<string, number>
      );
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

  async function checkout() {
    if (checkoutOptions?.paymentMode === "whatsapp") {
      if (!cart || cart.items.length === 0) return;
      const message = buildCartWhatsappMessage(cart, locale);
      window.open(buildWhatsappUrl(checkoutOptions.whatsappNumber, message), "_blank", "noopener,noreferrer");
      return;
    }

    if (!customer) {
      router.push(storefrontPath(`/register?next=${shippingSettings?.enabled ? "/checkout" : "/cart"}&checkout=1`));
      return;
    }

    // Shipping is off (or its setting hasn't loaded yet - defaulting to the
    // existing direct flow rather than making every shopper wait on an extra
    // request before their first click does anything): go straight to the
    // payment provider, same as before /checkout existed. Only when it's on
    // does the shopper need to stop at /checkout first to give an address.
    if (!shippingSettings?.enabled) {
      setStatus(t.preparingCheckout);
      try {
        let payload = await createCheckoutSession(getToken);

        if (!payload.success && payload.error?.code === "EMPTY_CART" && readLocalCartItems().length > 0) {
          setStatus(t.syncingCartCheckout);
          await syncLocalCartToApi();
          payload = await createCheckoutSession(getToken);
        }

        if (payload.success && payload.data?.checkoutUrl) {
          window.location.href = payload.data.checkoutUrl;
          return;
        }

        setStatus(payload.error?.message ?? t.checkoutFailed);
      } catch {
        setStatus(t.startApiCheckout);
      }
      return;
    }

    router.push(storefrontPath("/checkout"));
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
              <div className="flex flex-wrap items-center justify-center gap-2">
                <StorefrontLink
                  href="/products"
                  className="focus-ring inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-white"
                >
                  {t.browseProducts}
                </StorefrontLink>
                {checkoutOptions?.paymentMode === "whatsapp" && checkoutOptions.whatsappNumber ? (
                  <a
                    href={buildWhatsappUrl(checkoutOptions.whatsappNumber, buildInquiryWhatsappMessage(locale))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    <MessageCircle size={16} aria-hidden />
                    {t.askAboutProducts}
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            items.map((item) => {
              const itemId = item.slug;
              const stock = stockBySlug[item.slug];
              const outOfStock = stock === 0;
              const overStock = typeof stock === "number" && item.quantity > stock;
              const isPending = pendingItemId === itemId;

              return (
                <div
                  key={`${item.productId}-${item.variantId}`}
                  className="flex gap-4 border-b border-zinc-200 p-4 last:border-b-0"
                >
                  <StorefrontLink
                    href={`/products/${encodeURIComponent(item.slug)}`}
                    className="shrink-0"
                  >
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      width={80}
                      height={80}
                      className="h-20 w-20 rounded-md border border-zinc-200 bg-zinc-50 object-contain p-1"
                    />
                  </StorefrontLink>
                  <div className="min-w-0 flex-1">
                    <StorefrontLink
                      href={`/products/${encodeURIComponent(item.slug)}`}
                      className="font-semibold text-zinc-950 hover:text-accent"
                    >
                      {item.name}
                    </StorefrontLink>
                    <p className="mt-1 text-sm text-zinc-500">
                      {formatMoney(item.finalUnitPrice, "USD", locale === "es" ? "es-CO" : "en-US")} {t.qty.toLowerCase()}
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
                      <span
                        className="min-w-6 text-center text-sm font-semibold text-zinc-950"
                        aria-live="polite"
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => void changeQuantity(itemId, item.quantity + 1, stock)}
                        disabled={
                          isPending || (typeof stock === "number" && item.quantity >= stock)
                        }
                        aria-label={locale === "es" ? "Aumentar cantidad" : "Increase quantity"}
                        className="focus-ring grid h-9 w-9 place-items-center text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
                      >
                        <Plus size={14} aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="grid justify-items-end gap-3">
                    <strong className="text-zinc-950">{formatMoney(item.lineTotal, "USD", locale === "es" ? "es-CO" : "en-US")}</strong>
                    <button
                      type="button"
                      onClick={() => void removeItem(item.slug, item.name)}
                      className="focus-ring grid h-10 w-10 place-items-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-100"
                      title={t.remove}
                      aria-label={
                        locale === "es"
                          ? `Eliminar ${item.name} del carrito`
                          : `Remove ${item.name} from cart`
                      }
                    >
                      <Trash2 size={17} aria-hidden />
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
            <div className="flex justify-between"><dt>{t.subtotal}</dt><dd>{formatMoney(cart?.totals.subtotal ?? 0, "USD", locale === "es" ? "es-CO" : "en-US")}</dd></div>
            <div className="flex justify-between"><dt>{t.discount}</dt><dd>-{formatMoney(cart?.totals.discount ?? 0, "USD", locale === "es" ? "es-CO" : "en-US")}</dd></div>
            <div className="flex justify-between"><dt>{t.shipping}</dt><dd>{formatMoney(cart?.totals.shipping ?? 0, "USD", locale === "es" ? "es-CO" : "en-US")}</dd></div>
            <div className="flex justify-between border-t border-zinc-200 pt-3 text-base font-semibold"><dt>{t.total}</dt><dd>{formatMoney(cart?.totals.total ?? 0, "USD", locale === "es" ? "es-CO" : "en-US")}</dd></div>
          </dl>
          <div className="mt-5 grid gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void applyCoupon()}
              disabled={items.length === 0}
            >
              <Ticket size={17} aria-hidden />
              {t.applyCoupon}
            </Button>
            <Button type="button" onClick={() => void checkout()} disabled={items.length === 0}>
              {checkoutOptions?.paymentMode === "whatsapp" ? (
                <MessageCircle size={17} aria-hidden />
              ) : (
                <CreditCard size={17} aria-hidden />
              )}
              {checkoutOptions?.paymentMode === "whatsapp"
                ? locale === "es"
                  ? "Comprar por WhatsApp"
                  : "Buy via WhatsApp"
                : t.checkoutSandbox}
            </Button>
            {checkoutOptions?.paymentMode === "whatsapp" ? (
              <p className="text-xs leading-5 text-ink-muted">
                {locale === "es"
                  ? "Se abrira WhatsApp con el resumen de tu carrito para coordinar el pago con la tienda."
                  : "This opens WhatsApp with your cart summary so you can arrange payment with the store."}
              </p>
            ) : (
              <p className="text-xs leading-5 text-ink-muted">
                {locale === "es"
                  ? "Checkout de prueba: no hay cobro, venta ni envío real. Al continuar confirmas que leíste "
                  : "Sandbox checkout: there is no real charge, sale, or shipping. By continuing you confirm that you read "}
                <StorefrontLink
                  className="focus-ring font-semibold text-ink underline decoration-accent underline-offset-4"
                  href="/terms"
                >
                  {locale === "es" ? "los términos" : "the terms"}
                </StorefrontLink>{" "}
                {locale === "es" ? "y la " : "and the "}
                <StorefrontLink
                  className="focus-ring font-semibold text-ink underline decoration-accent underline-offset-4"
                  href="/privacy"
                >
                  {locale === "es" ? "política de privacidad" : "privacy policy"}
                </StorefrontLink>
                .
              </p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
