# Platform migration report — in progress

> This document is intentionally not a final acceptance report yet. It records
> verified work and remaining gates so the migration is not represented as
> complete before the demo and client path meet every requirement.

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
- `api-core`: pure cart/catalog/order operations, customer preferences, inventory operations and a provider-neutral checkout port; `apps/api` remains the D1/Stripe adapter.
- `agent-core`: shared intent list, mutable-tool authorization, PII redaction, composable Gemini prompts and provider-neutral model execution; the Worker remains the Cloudflare/Gemini adapter.
- `observability`: reusable request-ID, error-status and logger helpers used by API middleware.
- `core`, `schemas`, `api-client`, `ui`, `i18n` and `config-schema` now emit JS/declarations to `dist` and expose package entrypoints.
- `apps/api/migrations` and `apps/api/src/db/schema.ts` moved to `database/core/` without changing migration filenames or contents. Existing demo migrations remain for deployed-D1 compatibility; `pnpm create:client` now materializes the manifest-selected schema migrations without demo records.

## Compatibility

`formatUsd`, `AetherApiError`, `AetherClientOptions` and `createAetherClient`
remain deprecated compatibility exports. Existing API routes, Worker bindings,
environment variables, D1 table names, historical migrations and deployment
resource names remain unchanged. The Aether storefront continues to resolve the
same API, assistant and portfolio URLs from its new explicit configuration.

## Validation results

- `pnpm install --frozen-lockfile`: baseline pass.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (10 tests), `pnpm test:unit` (28 tests), `pnpm openapi:check`, `pnpm validate` and `pnpm build`: pass on the migration branch.
- API and AI Worker `wrangler deploy --dry-run`: pass; no deploy occurred.
- `pnpm test:e2e:assistant`: passes (9 desktop checks; one mobile-only case is intentionally excluded from the desktop project).
- `pnpm test:e2e`: passes (19 checks across desktop and mobile; one mobile-only case is intentionally excluded from the desktop project). The E2E server substitutes Clerk only under `AETHER_E2E_STUB_CLERK=true`; production bundles retain the real Clerk integration.

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
sibling repository starter with validated `config/`, typed app adapter entry
modules, `custom/`, optional database extensions/seeds and schema-only core D1
migrations. Client upgrades update package versions and run the checks
documented in `docs/platform/upgrading-client.md`.

## Deliberate remaining debt

- More API services (remaining admin operations) remain coupled to D1/Cloudflare and should be extracted one adapter at a time; inventory, order-status administration and idempotent webhook event persistence now have reusable ports. Provider signature verification remains intentionally in the integration adapter.
- `agent-core` still needs reusable graph/runtime, tool execution, memory and telemetry abstractions; the Worker remains the executable reference adapter.
- The client template has validated configuration, typed framework-neutral app adapters and migration generation. A client still selects and implements the concrete Next.js/Hono/Worker entrypoints and deployment bindings instead of receiving a copied demo.
- The Python/container assistant remains as a legacy runtime alongside the Worker; it was not removed because its CI tests and deployment path are still useful.
- A production publish requires GitHub Packages permission/registry access; the workflow is prepared but was not executed.
