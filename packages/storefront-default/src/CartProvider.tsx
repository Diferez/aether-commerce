"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Cart, Product } from "@aether-commerce/schemas";
import { createCartClient } from "./cart-client";
import { useStorefrontConfig } from "./AetherStorefrontProvider";

export type CartContextValue = {
  cart: Cart | null;
  itemCount: number;
  isSyncing: boolean;
  addItem: (product: Product, variantId?: string) => Promise<"synced" | "local">;
  updateQuantity: (itemId: string, quantity: number) => Promise<"synced" | "local">;
  removeItem: (itemId: string) => Promise<"synced" | "local">;
  applyCoupon: (code: string) => Promise<void>;
  refresh: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

// Deliberately reactive on top of cart-client's imperative, localStorage-
// backed functions rather than replacing them: every relocated consumer
// (SiteHeader, ProductDetailClient, the cart/checkout pages) still calls
// those functions directly today and isn't migrated until Phase 2b, so this
// provider listens to the same "aether-cart-changed"/"storage" window
// events cart-client already dispatches/relies on (see FloatingCart.tsx's
// existing pattern) instead of being the sole source of truth. That's what
// lets migrated and not-yet-migrated consumers coexist in the same app.
export function CartProvider({ children }: { children: ReactNode }) {
  const { apiBaseUrl } = useStorefrontConfig();
  const client = useMemo(() => createCartClient(apiBaseUrl), [apiBaseUrl]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const refresh = useCallback(() => {
    const nextCart = client.readLocalCart();
    setCart(nextCart.items.length > 0 ? nextCart : null);
  }, [client]);

  useEffect(() => {
    refresh();
    window.addEventListener("aether-cart-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("aether-cart-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  const addItem = useCallback(
    async (product: Product, variantId?: string) => {
      setIsSyncing(true);
      try {
        const result = await client.addProductToCart(product, variantId);
        refresh();
        return result;
      } finally {
        setIsSyncing(false);
      }
    },
    [client, refresh]
  );

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      setIsSyncing(true);
      try {
        const result = await client.updateCartItemQuantity(itemId, quantity);
        refresh();
        return result;
      } finally {
        setIsSyncing(false);
      }
    },
    [client, refresh]
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      setIsSyncing(true);
      try {
        const result = await client.removeProductFromCart(itemId);
        refresh();
        return result;
      } finally {
        setIsSyncing(false);
      }
    },
    [client, refresh]
  );

  const applyCoupon = useCallback(
    async (code: string) => {
      setIsSyncing(true);
      try {
        await client.applyCartCoupon(code);
        refresh();
      } finally {
        setIsSyncing(false);
      }
    },
    [client, refresh]
  );

  const itemCount = useMemo(() => cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0, [cart]);

  const value = useMemo<CartContextValue>(
    () => ({ cart, itemCount, isSyncing, addItem, updateQuantity, removeItem, applyCoupon, refresh }),
    [cart, itemCount, isSyncing, addItem, updateQuantity, removeItem, applyCoupon, refresh]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
