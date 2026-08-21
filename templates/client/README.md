# Client Store

This is a client implementation starter. It contains validated public store
configuration, extension points and app directories; it intentionally does not
copy Aether demo data, provider secrets or deployment resources.

1. Create it with `pnpm create:client <kebab-case-name>`.
2. Set `GITHUB_PACKAGES_TOKEN` to a GitHub Packages token with read access;
   the included `.npmrc` configures the scoped registry without storing a secret.
3. Run `pnpm install`, `pnpm validate`, then `git init`.
4. `apps/storefront/{layout,page}.tsx` and `apps/admin/{layout,page}.tsx` already
   render a working default skin - `@aether/storefront-default` and
   `@aether/admin-default` - wired to `config/`. Both directories also ship
   every business page as one-line re-exports, each in its own file under the
   matching route folder: `apps/admin/` has orders, products, customers,
   inventory, coupons, reviews, settings, activity, and system health;
   `apps/storefront/` has cart, checkout, account (favorites/orders),
   login/register, categories, products (catalog + detail), compare, and
   contact. Keep them as-is to use the default skin, or edit any individual
   file to design your own (you can still import individual pieces from the
   packages, or replace everything) - this is a per-file choice: keep the
   default admin panel while redesigning the storefront, replace one business
   page while keeping the rest, or vice versa. `apps/api/adapter.ts` and
   `apps/ai/adapter.ts` have no packaged default yet - implement those using
   their typed `adapter.ts`, `src/configuration.ts`, and the versioned
   `@aether/*` packages. Store secrets only in the deployment platform secret
   manager.
   - `apps/storefront/products/[slug]/page.tsx` and `categories/[slug]/page.tsx`
     have empty `generateStaticParams()` - static export needs real slugs to
     pre-render at build time, and a fresh client has no catalog yet. Wire
     these up once you have one.
   - Privacy, cookies, terms, returns, and shipping pages aren't included -
     that content is genuinely yours to write, not something a starter can
     provide. `config/legal.ts`'s `legalPolicyVersion` (sent by the contact
     form and the AI assistant) is a placeholder until you add real pages.
5. Every file under `apps/admin/` and `apps/storefront/` here is meant to be
   copied into the equivalent path inside a real Next.js project's `app/`
   directory (App Router) - this template intentionally doesn't scaffold
   `next.config`, `package.json` build scripts, or deployment config, since
   those depend on the hosting platform you choose. Run `create-next-app`
   (or your platform's equivalent) first, then copy these files in.

`config/` is public configuration (including `config/theme.ts` - colors and
fonts, separate from `config/brand.ts`'s name/logo); `custom/` contains
client-only pages, components, styling, animations and assets; `database/`
contains only client-specific extensions and optional seeds. The generator
also creates `database/migrations/` from the reusable Aether schema
migrations; it excludes the Aether demo's historical data migrations.

Never put provider secrets in `config/`; runtime secrets belong in the chosen
deployment platform's secret manager.

`tsconfig.validation.json` is used only by Aether's monorepo CI to resolve the
local unpublished package during template verification. Do not copy it to a
client repository.
