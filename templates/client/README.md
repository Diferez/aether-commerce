# Client Store

This is a client implementation starter. It contains validated public store
configuration, extension points and app directories; it intentionally does not
copy Aether demo data, provider secrets or deployment resources.

1. Create it with `pnpm create:client <kebab-case-name>`.
2. In the generated repository, add `.npmrc` with
   `@aether:registry=https://npm.pkg.github.com` and an authenticated GitHub
   Packages token available to your package manager.
3. Run `pnpm install`, `pnpm validate`, then `git init`.
4. Implement each app adapter under `apps/` using `src/configuration.ts` and
   the versioned `@aether/*` packages. Store secrets only in the deployment
   platform secret manager.

`config/` is public configuration; `custom/` contains client-only pages,
components, styling, animations and assets; `database/` contains only
client-specific extensions and optional seeds. The generator also creates
`database/migrations/` from the reusable Aether schema migrations; it excludes
the Aether demo's historical data migrations.

Never put provider secrets in `config/`; runtime secrets belong in the chosen
deployment platform's secret manager.

`tsconfig.validation.json` is used only by Aether's monorepo CI to resolve the
local unpublished package during template verification. Do not copy it to a
client repository.
