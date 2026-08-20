# Creating a client

Run `pnpm create:client client-store`. It creates a sibling directory without changing Aether. Configure the GitHub Packages registry, run `pnpm install`, complete `config/` (including `config/theme.ts` - colors/fonts, separate from `config/brand.ts`'s name/logo), add client customizations, run `git init`, then `pnpm typecheck`.

## Default skin, or your own

`apps/storefront` and `apps/admin` ship a real, working UI as `@aether/storefront-default` and `@aether/admin-default` - not just config. The generated client's `apps/storefront/page.tsx`, `apps/storefront/layout.tsx`, `apps/admin/page.tsx`, and `apps/admin/layout.tsx` are the override points:

- **Keep the default skin**: leave those files as-is. They already compose the published package's components (`Hero`, `SiteFooter`, `AdminSidebar`, `AdminTopBar`, ...) wired to your `config/`.
- **Design your own**: edit those files directly. You can still import individual pieces from the package (e.g. keep `AdminSidebar` but write your own storefront `page.tsx` from scratch), or replace everything with your own components.

This is a per-file choice, not all-or-nothing - a client can keep the default admin panel while fully redesigning the storefront, or vice versa.

As of this pass, the packaged default skin covers the storefront's `Hero`/`SiteFooter`/`LanguageProvider`/`StorefrontLink`, its product catalog (`CategoryGrid`/`ProductGrid`/`ProductCard`, with reactive `CartProvider`/`FavoritesProvider`/`CompareProvider` state - see below), and the admin panel's shell (`AdminSidebar`/`AdminTopBar`/`AdminLanguageProvider`/`RequireAdminAuth`/nav structure) - not yet `SiteHeader` (Clerk/cart/favorites/compare-entangled, coming with the auth/checkout pass) or the admin's business pages (orders, products, customers, dashboard, AI chat). Those still live only in `apps/storefront`/`apps/admin` and follow the same extraction pattern for a future pass: move the component into the relevant `packages/*-default` package, read config/state from `AetherStorefrontProvider`/`AetherAdminProvider` (or the new `CartProvider`/`FavoritesProvider`/`CompareProvider`) context instead of a static import, and leave a thin re-export behind in the reference app.

### Cart, favorites, and compare state

`CartProvider`/`useCart()`, `FavoritesProvider`/`useFavorites()`, and `CompareProvider`/`useCompare()` wrap the storefront alongside `AetherStorefrontProvider` (see `templates/client/apps/storefront/layout.tsx`). `FavoritesProvider` takes an explicit `customerId: string | null` prop - the package has no auth dependency, so the app resolves the id however it authenticates (or passes `null` for guest-only browsing) and passes it in, the same way `apps/storefront/components/AppProviders.tsx` derives it from Clerk in the reference deployment.
