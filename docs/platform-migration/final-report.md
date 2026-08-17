# Platform migration final report

## Previous architecture

The repository was a demo-focused pnpm monorepo. Shared packages were private,
resolved directly to `src`, and did not emit distributable artifacts. Aether
branding, USD defaults, shipping defaults and deployment URLs were mixed into
configuration/domain-adjacent code. The TypeScript assistant Worker concentrated
prompt security and runtime behavior in one module.

## New architecture

```text
apps/{storefront,admin,api,ai-assistant}
packages/{schemas,core,api-core,api-client,agent-core,observability,ui,i18n,config-schema}
config is represented by each implementation (Aether demo: apps/storefront/config)
database/{core/{schema.ts,migrations},demo/{fixtures,seeds}}
templates/client
docs/platform
```

## Packages and moved code

- `config-schema`: Zod contracts for brand, store, features, checkout, integrations, agent and navigation.
- `api-core`: pure cart item/merge/coupon/quantity operations; `apps/api` remains the D1/catalog adapter.
- `agent-core`: shared intent list, mutable-tool guardrail, PII redaction and composable Gemini prompts; the Worker remains the Cloudflare/Gemini adapter.
- `observability`: reusable request-ID, error-status and logger helpers used by API middleware.
- `core`, `schemas`, `api-client`, `ui`, `i18n` and `config-schema` now emit JS/declarations to `dist` and expose package entrypoints.
- `apps/api/migrations` and `apps/api/src/db/schema.ts` moved to `database/core/` without changing migration filenames or contents. Demo fixtures/seeds moved to `database/demo/`.

## Compatibility

`formatUsd`, `AetherApiError`, `AetherClientOptions` and `createAetherClient`
remain deprecated compatibility exports. Existing API routes, Worker bindings,
environment variables, D1 table names, historical migrations and deployment
resource names remain unchanged. The Aether storefront continues to resolve the
same API, assistant and portfolio URLs from its new explicit configuration.

## Validation results

- `pnpm install --frozen-lockfile`: pass.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm openapi:check`, `pnpm validate` and `pnpm build`: pass after migration.
- API and AI Worker `wrangler deploy --dry-run`: pass; no deploy occurred.
- `pnpm test:e2e:assistant`: its baseline passed (9 pass, 1 skipped). A final local rerun timed out while Clerk attempted to load its remote test UI bundle; this is an environment/test-isolation issue, not a TypeScript or Worker bundle regression. CI must rerun it with its configured Node 22/Clerk test setup before merge.
- `pnpm test:unit` remains the baseline local Vitest/Worker-pool failure under Node 18; no migration test was removed.
- Full `pnpm test:e2e` remained inconclusive locally due the 120-second tool budget; CI uses Node 22 and remains authoritative.

## Demo status

Storefront, admin static export, Hono API dry-run, AI Worker dry-run, catalog,
cart, Stripe checkout adapter, auth middleware, webhooks, inventory routes and
existing observability all build against the same public behavior.

## Releases and clients

Changesets governs SemVer. Use `pnpm changeset`, review the release PR, run
`pnpm version:packages`, then manually trigger `Publish Aether packages` for
GitHub Packages. It is intentionally independent of development/production
deployment workflows.

Create a client with `pnpm create:client <kebab-case-name>`. It creates a
sibling repository shell with `config/`, `custom/`, app directories and optional
database extensions/seeds. Client upgrades update package versions and run the
checks documented in `docs/platform/upgrading-client.md`.

## Deliberate remaining debt

- More API services (catalog, orders, payments, customers and webhooks) remain thinly coupled to D1/Cloudflare and should be extracted one adapter at a time.
- The Python/container assistant remains as a legacy runtime alongside the Worker; it was not removed because its CI tests and deployment path are still useful.
- A production publish requires GitHub Packages permission/registry access; the workflow is prepared but was not executed.
