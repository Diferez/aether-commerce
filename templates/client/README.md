# Client Store

This is a client implementation starter. It contains validated public store
configuration, extension points and app directories; it intentionally does not
copy Aether demo data, provider secrets or deployment resources.

1. Create it with `pnpm create:client <kebab-case-name>`.
2. Set `GITHUB_PACKAGES_TOKEN` to a GitHub Packages token with read access;
   the included `.npmrc` configures the scoped registry without storing a secret.
3. Run `pnpm install`, `pnpm validate`, then `git init`.
4. `apps/admin/` and `apps/storefront/` are real, deployable Next.js projects
   (App Router, `output: "export"`, their own `package.json`/`next.config.mjs`)
   wired together by the root `pnpm-workspace.yaml` - `pnpm --filter ./apps/admin build`
   (or `./apps/storefront`) produces a static `out/` directory for each.
   `apps/admin/app/{layout,page}.tsx` and `apps/storefront/app/{layout,page}.tsx`
   already render a working default skin - `@aether/admin-default` and
   `@aether/storefront-default` - wired to `config/`. Both directories also ship
   every business page as one-line re-exports, each in its own file under the
   matching route folder: `apps/admin/app/` has orders, products, customers,
   inventory, coupons, reviews, settings, activity, and system health;
   `apps/storefront/app/` has cart, checkout, account (favorites/orders),
   login/register, categories, products (catalog + detail), compare, and
   contact. Keep them as-is to use the default skin, or edit any individual
   file to design your own (you can still import individual pieces from the
   packages, or replace everything) - this is a per-file choice: keep the
   default admin panel while redesigning the storefront, replace one business
   page while keeping the rest, or vice versa. Store secrets only in the
   deployment platform secret manager. Both apps require
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` at build time (it's read at
   module-eval time, so the build fails fast without it, the same as this
   repo's own `apps/admin`/`apps/storefront`).
   - `apps/api/` is also a real, deployable Cloudflare Worker -
     `apps/api/src/index.ts` wires up `@aether/api-worker`'s `createApiApp()`
     (every commerce/admin/admin-chat route, already built) the same way this
     repo's own `apps/api` does. Before it can run: `wrangler d1 create
     <name>` and paste the real `database_id` into `apps/api/wrangler.jsonc`
     (the checked-in one is a local-dev placeholder), then
     `pnpm --filter ./apps/api db:migrate:local` (or `:remote`). It needs
     `CLERK_SECRET_KEY`/`CLERK_JWT_ISSUER` to authenticate admin requests;
     `AETHER_CART_TOKEN_SECRET`/`AETHER_SETTINGS_ENCRYPTION_KEY` for cart
     tokens and encrypted integration secrets; `STRIPE_SECRET_KEY`/
     `WOMPI_SECRET_KEY`, `RESEND_API_KEY`, `CLOUDINARY_*`, and `GEMINI_API_KEY`
     are each optional - every integration already degrades gracefully
     without its secret set, so only configure the providers you actually
     use. `apps/api/wrangler.jsonc`'s `vars` block also carries
     `STORE_CURRENCY`, `STORE_LOCALE`, `STORE_COUNTRY`, `BRAND_NAME`,
     `EMAIL_FROM`, `OBSERVABILITY_SERVICE_NAME`, and `AI_ASSISTANT_NAME` -
     override these to replace the "client-store" placeholders `create:client`
     already substituted. `apps/ai/adapter.ts` has no packaged default yet -
     implement it using its typed `adapter.ts`, `src/configuration.ts`, and
     the versioned `@aether/*` packages.
   - `apps/storefront/app/products/[slug]/page.tsx` and `categories/[slug]/page.tsx`
     ship `generateStaticParams()` returning a single `"example"` placeholder
     slug - `output: "export"` refuses to emit zero pages for a dynamic
     segment, and a fresh client has no catalog yet. Replace it with real
     slugs from your own catalog once you have one.
   - Privacy, cookies, terms, returns, and shipping pages aren't included -
     that content is genuinely yours to write, not something a starter can
     provide. `config/legal.ts`'s `legalPolicyVersion` (sent by the contact
     form and the AI assistant) is a placeholder until you add real pages.
5. `apps/storefront/wrangler.jsonc` and `apps/api/wrangler.jsonc` each deploy
   their own Cloudflare Worker (`wrangler deploy`, or each app's own
   `pnpm deploy`) - the storefront's serves its static `out/` directory, the
   API's runs `@aether/api-worker` directly. The admin panel has no
   `wrangler.jsonc` of its own - deploy its `out/` directory to Cloudflare
   Pages instead (`wrangler pages deploy apps/admin/out --project-name=<name>`),
   the same split this repo's own `apps/admin`/`apps/storefront` use.
   `apps/ai/` is a configuration adapter only, not a deployable project yet
   (see point 4) - there is no AI Worker to deploy from this template until
   you implement one. `.github/workflows/deploy.yml` runs all of this
   automatically on every push to `main` (see "Deploy" below).

## Deploy

`.github/workflows/deploy.yml` builds and deploys all three apps on every
push to `main` (or manually via the Actions tab's "Run workflow"). Before
the first run can succeed:

1. `wrangler d1 create <name>` and paste the real `database_id` into
   `apps/api/wrangler.jsonc` (see point 4 above).
2. In the repo's GitHub Settings -> Secrets and variables -> Actions, add:
   - **Secrets** (`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are
     required - nothing deploys without them; every other one is optional,
     matching what each service already tolerates missing):
     `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
     `AETHER_CART_TOKEN_SECRET`, `AETHER_SETTINGS_ENCRYPTION_KEY`,
     `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER`, `CLERK_WEBHOOK_SECRET`,
     `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `WOMPI_SECRET_KEY`,
     `WOMPI_EVENTS_SECRET`, `RESEND_API_KEY`, `CONTACT_RECIPIENT_EMAIL`,
     `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
     `GEMINI_API_KEY`, `SENTRY_DSN`.
   - **Variables**: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (required - admin and
     storefront both fail to build without it); `ADMIN_PAGES_PROJECT` if you
     want a Cloudflare Pages project name other than the default
     `<name>-admin`; `NEXT_PUBLIC_AETHER_BASE_PATH` only if the storefront
     isn't served from its domain's root.
3. After the first successful deploy, Cloudflare will have assigned real
   URLs to the admin Pages project and the storefront/API Workers - set
   `APP_ORIGIN_STORE`/`APP_ORIGIN_ADMIN` as GitHub variables (and update the
   same-named entries in `apps/api/wrangler.jsonc`'s `vars` block) to those
   real URLs; nothing reads them automatically before that first deploy.

The workflow doesn't touch `apps/ai/` - there's no AI Worker to deploy yet
(see point 5).

## Aether updates

Add the repository secret `AETHER_PACKAGES_TOKEN` with read access to the
Aether package registry. Dependabot groups Aether releases into a weekly pull
request. You can also run **Update Aether platform** manually; it updates every
workspace dependency, synchronizes D1 migrations, validates the store and opens
a pull request. The normal deployment synchronizes migrations once more before
applying them.

`config/` is public configuration (including `config/theme.ts` - colors and
fonts, separate from `config/brand.ts`'s name/logo); `custom/` contains
client-only pages, components, styling, animations and assets; `database/`
contains only client-specific extensions and optional seeds. The generator
also creates `database/migrations/` from the reusable Aether schema
migrations; it excludes the Aether demo's historical data migrations.
Keep `STORE_CURRENCY`, `STORE_LOCALE` and `STORE_COUNTRY` in
`apps/api/wrangler.jsonc` aligned with `config/store.ts`.

Never put provider secrets in `config/`; runtime secrets belong in the chosen
deployment platform's secret manager.

`tsconfig.validation.json` is used only by Aether's monorepo CI to resolve the
local unpublished package during template verification. Do not copy it to a
client repository.
