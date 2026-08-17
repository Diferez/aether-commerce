# Platform migration report — in progress

> The reusable platform foundation and the Aether demo are validated. This is
> not a full acceptance report yet: the gaps listed under **Deliberate
> remaining debt** prevent representing the entire migration as complete.

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
- `api-core`: pure cart/catalog (including product overrides)/order (including customer and admin reads), coupon, shipping-settings and contact-message operations, customer profile, preferences, addresses and public/customer/admin-review operations, inventory operations and a provider-neutral checkout port; `apps/api` remains the D1/Stripe adapter.
- `agent-core`: shared intent list, deterministic execution planning, mutable-tool authorization, PII redaction, composable Gemini prompts, provider-neutral model execution, conversation-memory ownership, client-gateway cart tool execution and tool-telemetry policy; the Worker remains the Cloudflare/Gemini/D1 adapter.
- `observability`: reusable request-ID, error-status and logger helpers used by API middleware.
- `core`, `schemas`, `api-client`, `ui`, `i18n` and `config-schema` now emit JS/declarations to `dist` and expose package entrypoints.
- `apps/api/migrations` and `apps/api/src/db/schema.ts` moved to `database/core/` without changing migration filenames or contents. Existing demo migrations remain for deployed-D1 compatibility; `pnpm create:client` now materializes the manifest-selected schema migrations without demo records.

## Compatibility

`formatUsd`, `AetherApiError`, `AetherClientOptions` and `createAetherClient`
remain deprecated compatibility exports. Existing API routes, Worker bindings,
environment variables, D1 table names, historical migrations and deployment
resource names remain unchanged. The Aether storefront continues to resolve the
same API, assistant and portfolio URLs from its new explicit configuration.

## Main code movements

- `apps/api/src/services/*` -> `packages/api-core/src/{cart,catalog,orders,customers,inventory,webhooks,reviews,contact,coupons,shipping}.ts`, leaving D1, Clerk, Stripe and provider-signature adapters in the API app.
- assistant intent, provider runtime, memory lifecycle, cart-tool gateway execution, execution planning and audit/counter ordering -> `packages/agent-core/src/`; D1 persistence and the HTTP gateway remain in `apps/ai-assistant/adapters/` and the Worker.
- package-neutral request IDs, error-status normalization, structured logging and the audit-event contract -> `packages/observability/src/index.ts`.
- API schema and historical migrations -> `database/core/{schema.ts,migrations}`; demo records -> `database/demo/{fixtures,seeds}`.
- Aether branding/configuration -> `apps/storefront/config/`; its reusable validation contracts -> `packages/config-schema/`.

## Validation results

- `pnpm install --frozen-lockfile`: passes on the current migration branch.
- On the current validation checkpoint, `pnpm typecheck`, `pnpm lint`, `pnpm test` (10 tests), `pnpm test:unit` (53 tests), `pnpm openapi:check`, `pnpm validate`, `pnpm build`, `pnpm check:boundaries`, `pnpm test:client-template`, `pnpm test:e2e` and `pnpm test:e2e:assistant` all pass.
- API and AI Worker `wrangler deploy --dry-run`: pass; no deploy occurred. `python tests/run_direct.py` also passes for the preserved Python/LangGraph runtime.
- `pnpm test:e2e:assistant`: passes (9 desktop checks; one mobile-only case is intentionally excluded from the desktop project).
- `pnpm test:e2e`: passes (19 checks across desktop and mobile; one mobile-only case is intentionally excluded from the desktop project). The E2E server substitutes Clerk only under `AETHER_E2E_STUB_CLERK=true`; production bundles retain the real Clerk integration.
- `python tests/run_direct.py` from `apps/ai-assistant`: passes for the preserved Python/LangGraph runtime.

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

- Remaining D1-bound work is explicit: admin settings/audit operations. Customer profile, addresses, customer-scoped order reads, public/customer/admin-review operations, product overrides, coupon, shipping-settings and contact persistence, inventory, order-status administration and idempotent webhook event persistence now have reusable ports. Provider signature verification remains intentionally in the integration adapter.
- The client template has validated configuration, typed framework-neutral app adapters and migration generation. A client still selects and implements the concrete Next.js/Hono/Worker entrypoints and deployment bindings instead of receiving a copied demo.
- The Python/LangGraph container assistant remains as a legacy runtime alongside the TypeScript Cloudflare Worker. Its graph, tools, storage and tests cannot be removed or folded into the Worker without a dedicated adapter-by-adapter migration; keeping it is deliberate compatibility, not an indication that LangGraph has been migrated to the TypeScript package.
- A production publish requires GitHub Packages permission/registry access; the workflow is prepared but was not executed.
