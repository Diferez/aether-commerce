"use client";

import type { ReactNode } from "react";
import { CartProvider, CompareProvider, FavoritesProvider, useAetherAuth } from "@aether-commerce/storefront-default";

/** Keeps account-scoped favorites connected to the authenticated customer. */
export function AppProviders({ children }: { children: ReactNode }) {
  const { customer } = useAetherAuth();
  return (
    <CartProvider>
      <FavoritesProvider customerId={customer?.id ?? null}>
        <CompareProvider>{children}</CompareProvider>
      </FavoritesProvider>
    </CartProvider>
  );
}
