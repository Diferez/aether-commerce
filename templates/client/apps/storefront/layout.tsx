import type { ReactNode } from "react";
import { AetherStorefrontProvider, CartProvider, CompareProvider, FavoritesProvider } from "@aether/storefront-default";
import { clientConfiguration } from "../../src/configuration.js";

/**
 * Wire this into your Next.js project's real app/layout.tsx (this template
 * ships the pattern, not a standalone runnable app - scaffold your own
 * Next.js app the normal way, then import from here). apiBaseUrl resolution
 * (env vars, hostname sniffing, ...) is deliberately your app's own concern,
 * not the package's - it differs per deployment. Using productionBaseUrl
 * unconditionally here is illustrative; a real app typically branches on
 * environment the way apps/storefront's own reference layout does.
 *
 * CartProvider/FavoritesProvider/CompareProvider are the reactive
 * counterparts to the static AetherStorefrontProvider - they back the
 * catalog components (ProductGrid, ProductCard, FloatingCart). Favorites are
 * scoped by customerId; pass null for guest-only browsing until you wire up
 * your own auth (see docs/platform/creating-a-client.md for the pattern the
 * Aether reference storefront uses with Clerk).
 */
export function ClientStorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <AetherStorefrontProvider config={clientConfiguration} apiBaseUrl={clientConfiguration.integrations.api.productionBaseUrl}>
      <CartProvider>
        <FavoritesProvider customerId={null}>
          <CompareProvider>{children}</CompareProvider>
        </FavoritesProvider>
      </CartProvider>
    </AetherStorefrontProvider>
  );
}
