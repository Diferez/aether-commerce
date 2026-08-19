"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ShoppingCart, Trash2, X } from "lucide-react";
import { formatMoney } from "@aether/core";
import type { Cart } from "@aether/schemas";
import { readLocalCart, removeProductFromCart } from "./cart-client";
import { useLanguage } from "./LanguageProvider";
import { StorefrontLink } from "./StorefrontLink";

export function FloatingCart() {
  const { locale, t } = useLanguage();
  const [cart, setCart] = useState<Cart | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  function syncCart() {
    const nextCart = readLocalCart();
    setCart(nextCart.items.length > 0 ? nextCart : null);
    if (nextCart.items.length === 0) {
      setIsOpen(false);
    }
  }

  useEffect(() => {
    syncCart();
    window.addEventListener("aether-cart-changed", syncCart);
    window.addEventListener("storage", syncCart);
    return () => {
      window.removeEventListener("aether-cart-changed", syncCart);
      window.removeEventListener("storage", syncCart);
    };
  }, []);

  const itemCount = useMemo(
    () => cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0,
    [cart]
  );

  async function removeItem(itemId: string) {
    await removeProductFromCart(itemId);
    syncCart();
  }

  if (!cart || itemCount === 0) {
    return null;
  }

  return (
    <div className="fixed right-5 z-40" style={{ bottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}>
      {isOpen ? (
        <div
          className="mb-3 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-chat border border-chat-border bg-chat-bg shadow-2xl"
          role="dialog"
          aria-label={locale === "es" ? "Carrito rápido" : "Quick cart"}
        >
          <div className="flex items-center justify-between border-b border-chat-border bg-chat-surface px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-chat-text">{locale === "es" ? "Carrito rápido" : "Quick cart"}</p>
              <p className="text-xs text-chat-text-muted">
                {itemCount} {itemCount === 1 ? t.product.toLowerCase() : locale === "es" ? "productos" : "products"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="focus-ring grid h-9 w-9 place-items-center rounded-chat text-chat-text-muted hover:bg-chat-surface-alt hover:text-chat-text"
              aria-label={locale === "es" ? "Cerrar carrito" : "Close cart"}
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto p-3">
            {cart.items.map((item) => (
              <div key={`${item.productId}-${item.variantId ?? "default"}`} className="flex gap-3 border-b border-chat-border py-3 last:border-b-0">
                <Image src={item.imageUrl} alt={item.name} width={56} height={56} className="h-14 w-14 rounded-xl bg-chat-surface-alt object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-chat-text">{item.name}</p>
                  <p className="text-xs text-chat-text-muted">
                    {t.qty} {item.quantity} · {formatMoney(item.lineTotal, "USD", locale === "es" ? "es-CO" : "en-US")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeItem(item.slug)}
                  className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-chat border border-chat-border text-chat-text-muted hover:bg-chat-surface-alt hover:text-chat-text"
                  aria-label={locale === "es" ? `Eliminar ${item.name}` : `Remove ${item.name}`}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-chat-border p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-chat-text-muted">{t.total}</span>
              <strong className="text-lg text-chat-text">
                {formatMoney(cart.totals.total, "USD", locale === "es" ? "es-CO" : "en-US")}
              </strong>
            </div>
            <StorefrontLink
              href="/cart"
              onClick={() => setIsOpen(false)}
              className="focus-ring mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-chat bg-chat-accent px-4 text-sm font-semibold text-white"
            >
              {locale === "es" ? "Ver carrito" : "View cart"}
              <ChevronRight size={17} aria-hidden />
            </StorefrontLink>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="focus-ring group flex h-14 w-14 items-center justify-center gap-3 rounded-full border border-chat-border bg-chat-surface text-chat-text shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition hover:-translate-y-0.5 hover:bg-chat-surface-alt sm:w-auto sm:justify-start sm:px-4"
        aria-expanded={isOpen}
        aria-label={locale === "es" ? "Abrir carrito rápido" : "Open quick cart"}
      >
        <span className="relative grid h-9 w-9 place-items-center rounded-full bg-chat-success/20 text-chat-success">
          <ShoppingCart size={18} aria-hidden />
          <span className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-chat-success px-1 text-xs font-bold text-chat-bg">
            {itemCount}
          </span>
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-xs text-chat-text-muted">{locale === "es" ? "Carrito" : "Cart"}</span>
          <span className="block text-sm font-semibold">
            {formatMoney(cart.totals.total, "USD", locale === "es" ? "es-CO" : "en-US")}
          </span>
        </span>
      </button>
    </div>
  );
}
