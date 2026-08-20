"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Product } from "@aether/schemas";
import { readFavoriteProducts, toggleFavoriteProduct, removeFavoriteProduct, migrateGuestFavoritesToCustomer } from "./favorites-client";

export type FavoritesContextValue = {
  favorites: Product[];
  isFavorite: (productId: string) => boolean;
  toggleFavorite: (product: Product) => "added" | "removed";
  removeFavorite: (productId: string) => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

// customerId is an explicit prop, not read from an auth hook - this package
// has no auth dependency. The app resolves it however it authenticates
// (Clerk today, in apps/storefront's AppProviders) and passes it in; guest
// browsing just passes null.
export function FavoritesProvider({ customerId, children }: { customerId: string | null; children: ReactNode }) {
  const [favorites, setFavorites] = useState<Product[]>([]);
  const previousCustomerId = useRef<string | null>(null);

  const refresh = useCallback(() => {
    setFavorites(readFavoriteProducts(customerId));
  }, [customerId]);

  useEffect(() => {
    if (customerId && previousCustomerId.current !== customerId) {
      migrateGuestFavoritesToCustomer(customerId);
    }
    previousCustomerId.current = customerId;
    refresh();
  }, [customerId, refresh]);

  useEffect(() => {
    window.addEventListener("aether-favorites-changed", refresh);
    return () => window.removeEventListener("aether-favorites-changed", refresh);
  }, [refresh]);

  const isFavorite = useCallback((productId: string) => favorites.some((product) => product.id === productId), [favorites]);

  const toggleFavorite = useCallback(
    (product: Product) => {
      const result = toggleFavoriteProduct(product, customerId);
      refresh();
      return result;
    },
    [customerId, refresh]
  );

  const removeFavorite = useCallback(
    (productId: string) => {
      removeFavoriteProduct(productId, customerId);
      refresh();
    },
    [customerId, refresh]
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({ favorites, isFavorite, toggleFavorite, removeFavorite }),
    [favorites, isFavorite, toggleFavorite, removeFavorite]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return context;
}
