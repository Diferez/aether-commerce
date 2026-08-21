# Creating a client

Run `pnpm create:client client-store`. It creates a sibling directory without changing Aether, pins every `@aether-commerce/*` dependency to the versions in this repository and materializes the complete client-safe D1 history. Configure `GITHUB_PACKAGES_TOKEN`, run `pnpm install`, complete `config/`, run `git init`, then `pnpm validate`.

## Default skin, or your own

`apps/storefront` and `apps/admin` ship a real, working UI as `@aether-commerce/storefront-default` and `@aether-commerce/admin-default` - not just config. The generated client's `apps/storefront/page.tsx`, `apps/storefront/layout.tsx`, `apps/admin/page.tsx`, and `apps/admin/layout.tsx` are the override points:

- **Keep the default skin**: leave those files as-is. They already compose the published package's components (`Hero`, `SiteFooter`, `AdminSidebar`, `AdminTopBar`, ...) wired to your `config/`.
- **Design your own**: edit those files directly. You can still import individual pieces from the package (e.g. keep `AdminSidebar` but write your own storefront `page.tsx` from scratch), or replace everything with your own components.

This is a per-file choice, not all-or-nothing - a client can keep the default admin panel while fully redesigning the storefront, or vice versa.

The packages cover the storefront shell, header, catalog, cart, checkout, accounts and optional assistant, plus the complete default admin shell and business pages. Client route files remain thin override points, so compatible fixes arrive through package updates without overwriting client-owned code.

### Cart, favorites, and compare state

`CartProvider`/`useCart()`, `FavoritesProvider`/`useFavorites()`, and `CompareProvider`/`useCompare()` wrap the storefront alongside `AetherStorefrontProvider`. The generated `AppProviders` derives the customer id from Aether's Clerk bridge, so favorites remain scoped to the signed-in customer by default.

## Branding contract

Client-owned changes belong in `config/` and `custom/`. `config/brand.ts` controls identity, `config/theme.ts` controls the complete storefront and admin token set, `config/store.ts` controls currency/locale/country, and `config/features.ts` enables supported modules. Avoid editing package code in the client repository.

Mirror `config/store.ts` in `apps/api/wrangler.jsonc`'s `STORE_CURRENCY`, `STORE_LOCALE` and `STORE_COUNTRY` vars. Secrets never belong in either location.
