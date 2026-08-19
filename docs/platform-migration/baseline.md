# Platform migration baseline

Date: 2026-08-16  
Base revision: `640d2a3` (`develop`)  
Migration branch: `refactor/platform-client-architecture`

## Scope observed

The repository is a pnpm/Turborepo workspace with these runtime applications:

| Application | Runtime | Responsibility |
| --- | --- | --- |
| `apps/storefront` | Next.js static export + Cloudflare Workers Assets | Aether reference storefront |
| `apps/admin` | Next.js static export + Cloudflare Pages | Admin dashboard and Aether Chat client |
| `apps/api` | Hono + Cloudflare Workers + D1 | Public/admin commerce API, checkout, webhooks and integrations |
| `apps/ai-assistant` | Cloudflare Worker (TypeScript) and a retained Python container implementation | Customer-facing sales assistant, audit trail, rate limits and Gemini access |

Existing shared packages are `@aether/api-client`, `@aether/config`, `@aether/core`,
`@aether/i18n`, `@aether/schemas`, `@aether/testing`, `@aether/types`, and `@aether/ui`.
All shared packages are currently private and their `build` scripts only run TypeScript
with `--noEmit`; therefore none is currently a publishable artifact.

## Dependency map

```text
@aether/schemas -> @aether/core -> @aether/ui -> storefront
@aether/schemas -> @aether/api-client -> storefront/admin
@aether/schemas + @aether/core -> apps/api
apps/ai-assistant -> public API and AETHER_API service binding
```

No source imports directly from another application were found. The important coupling is
configuration by `AETHER_*` environment variables and service URLs rather than TypeScript
cross-app imports.

## Public API groups

The API retains the `/api/v1` boundary. Route modules currently cover:

- catalog and categories;
- cart and signed cart-token mutations;
- checkout and Stripe session creation;
- account, user and customer data;
- contact;
- admin operations;
- public configuration/shipping;
- Stripe webhooks; and
- health/status endpoints.

The assistant retains `/healthz`, `/readyz`, `/metrics`,
`/v1/assistant/messages`, `/v1/assistant/messages/stream`, conversation routes and the
protected internal audit-events route.

## Data and deployment baseline

- The authoritative deployed migrations are `apps/api/migrations/0001` through `0006`.
- `database/` currently holds documentation, demo fixtures and seed documentation; it is
  not the migration source consumed by Wrangler.
- The assistant has its own `apps/ai-assistant/migrations/0001_initial.sql`.
- Existing Cloudflare resource names, D1 binding `DB`, rate-limit bindings and production /
  development Wrangler files are in scope for preservation.
- `develop` triggers the development workflow and `main` triggers production. This migration
  branch deliberately triggers neither deployment workflow until it is merged through the
  existing flow.

## Aether-specific coupling found

- `packages/config/src/index.ts` hardcodes Aether brand, USD and free-tier settings.
- `packages/core/src/shipping.ts` includes default countries, USD shipping rates and an
  `Aether fulfillment network` tracking location.
- `packages/core/src/money.ts` exposes USD-only formatting.
- Storefront configuration embeds Aether production Worker and portfolio URLs.
- The API demo migration seeds Aether branding and portfolio metadata.
- Storefront/admin CSS embeds the Aether accent (`#8b5cf6`).
- Deployment workflows and Wrangler generation scripts are correctly environment-specific,
  but intentionally Aether-named because they deploy the reference implementation.

## Integrations and security boundaries

Current concrete integrations are Clerk, Stripe, Cloudinary, Resend, Gemini, Cloudflare D1,
Cloudflare rate limits and Sentry configuration. Secrets are injected as Worker secrets or
GitHub environment secrets; they must not enter client configuration packages. Stripe webhook
verification, Clerk JWT validation, signed cart tokens, CORS, rate limits, audit events and
agent tool authorization are existing protection boundaries to preserve.

## Test baseline

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Pass | Lockfile reproduced with pnpm 8.6.0. |
| `pnpm typecheck` | Pass | All 11 workspace packages passed. |
| `pnpm lint` | Pass | All 11 workspace packages passed. |
| `pnpm test` | Pass | 9 contract/regression tests passed. |
| `pnpm openapi:check` | Pass | Required Aether v1 routes present. |
| `pnpm build` | Pass | API dry-run, storefront static export and admin static export passed. |
| `pnpm test:unit` | Pre-existing failure | Vitest 4.0.0 fails before test collection in `packages/core/src/catalog.test.ts` and `apps/api/src/services/catalog.test.ts`: `Unknown method: getBuiltins. Expected \"fetchModule\".` The local Node runtime is 18.1.0 whereas CI uses Node 22. This is not a migration regression. |
| `pnpm test:e2e:assistant` | Pass | 9 passed; 1 mobile-only scenario skipped by its test definition. |
| `pnpm test:e2e` | Inconclusive locally | Did not complete before the 120-second local command budget. The targeted assistant E2E passed; CI remains the authoritative complete-browser run. |

`pnpm validate` is equivalent to typecheck, lint, `pnpm test`, and OpenAPI validation; all of
those constituent checks pass at baseline. Playwright and the Python/container assistant suite
remain CI-oriented due to their local service and Docker prerequisites and are re-run after
the package and adapter phases.

## Migration risks

1. Publishing packages requires a real emitted `dist` while Next.js and Workers currently
   resolve workspace source directly.
2. The TypeScript assistant Worker is a large single module, so it must be extracted via
   stable contracts and a thin adapter, not rewritten.
3. Existing historical D1 migrations must remain in their current path until a compatible
   wrapper is proven.
4. Local untracked files `apps/api/.dev.vars` and `apps/storefront/wrangler.production.json`
   predate this migration and are intentionally excluded from changes.
