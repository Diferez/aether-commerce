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
   `@aether/admin-default` - wired to `config/`. Keep them as-is to use the
   default skin, or edit those files to design your own (you can still import
   individual pieces from the packages, or replace everything). This is a
   per-file choice: keep the default admin panel while redesigning the
   storefront, or vice versa. `apps/api/adapter.ts` and `apps/ai/adapter.ts`
   have no packaged default yet - implement those using their typed
   `adapter.ts`, `src/configuration.ts`, and the versioned `@aether/*`
   packages. Store secrets only in the deployment platform secret manager.

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
