"use client";

import type { ReactNode } from "react";
import { CartProvider, CompareProvider, FavoritesProvider } from "@aether/storefront-default";
import { useCustomerSession } from "./customer-client";

// Composes the reactive Phase-2a providers (cart/favorites/compare) so
// app/layout.tsx stays simple. Nested inside ClerkAuthProvider so
// useCustomerSession() (Clerk-backed) can resolve the customerId
// FavoritesProvider scopes favorites by - this package itself has no auth
// dependency, the app supplies the id.
export function AppProviders({ children }: { children: ReactNode }) {
  const { customer } = useCustomerSession();

  return (
    <CartProvider>
      <FavoritesProvider customerId={customer?.id ?? null}>
        <CompareProvider>{children}</CompareProvider>
      </FavoritesProvider>
    </CartProvider>
  );
}
