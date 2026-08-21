"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { CartProvider, CompareProvider, FavoritesProvider } from "@aether-commerce/storefront-default";
import { useCustomerSession } from "./customer-client";
import { migrateLegacyAetherStorage } from "./legacy-storage";

// Composes the reactive Phase-2a providers (cart/favorites/compare) so
// app/layout.tsx stays simple. Nested inside AetherAuthProvider so
// useCustomerSession() (Clerk-backed) can resolve the customerId
// FavoritesProvider scopes favorites by - this package itself has no auth
// dependency, the app supplies the id.
export function AppProviders({ children }: { children: ReactNode }) {
  const { customer } = useCustomerSession();

  // One-time cleanup of pre-DummyJSON-migration localStorage keys - purely
  // Aether-reference-specific (see legacy-storage.ts), so it lives here at
  // the app level rather than in @aether-commerce/storefront-default's SiteHeader,
  // which used to run it. The "your data was cleared" notice SiteHeader
  // used to show alongside this is dropped: cosmetic, for a years-old
  // one-time migration, not worth a package-level API just to preserve it.
  useEffect(() => {
    migrateLegacyAetherStorage();
  }, []);

  return (
    <CartProvider>
      <FavoritesProvider customerId={customer?.id ?? null}>
        <CompareProvider>{children}</CompareProvider>
      </FavoritesProvider>
    </CartProvider>
  );
}
