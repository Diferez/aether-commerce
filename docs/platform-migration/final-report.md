# Platform migration report

> The reusable platform foundation and the Aether demo are validated. The
> remaining items under **Deliberate remaining debt** are explicit deployment
> and legacy-runtime boundaries, not regressions in the reference store.

> **Update (post-main-merge):** this report describes the state right after
> the platform migration itself. `develop` has since absorbed 62 commits from
> `main` that had shipped independently and were already in production (a
> full admin-panel rebuild, the "Aether Chat" admin agent, WhatsApp checkout,
> checkout-snapshot integrity checks, Cloudinary uploads). Two things below
> are no longer accurate as a result: (1) the Python/LangGraph container
> described throughout this report was fully removed (superseded by a
> TypeScript LangGraph.js Worker) - see `docs/platform/agent-extension.md`
> for the current state; (2) `api-core`'s "product overrides" and
> "administration reads" ports (line 29, 91 below) are no longer what the
> reference app demonstrates - `apps/api/src/routes/admin.ts` now uses
> direct D1 queries and main's dedicated services instead, since the
> reference store's product architecture moved off the dummyjson+override
> model these ports were built for. The packages still export those classes
> as reusable library surface (unused, not broken) - see
> `docs/platform/package-boundaries.md` for the current, accurate picture.
> `database/core/client-migrations.manifest.json` (line 33 below) has also
> been updated since - it now includes the 11 additional schema migrations
> main's merge introduced (products table, checkout snapshots, order
> channel/status columns, inventory reservations, admin-chat tables,
> observability columns), not just the original four.

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
config/aether (the explicit Aether reference implementation configuration)
database/{core/{schema.ts,migrations},demo/{fixtures,seeds}}
templates/client
docs/platform
```

## Packages and moved code

- `config-schema`: Zod contracts for brand, store, features, checkout, integrations, agent and navigation.
- `api-core`: pure cart/catalog (including product overrides)/order (including customer and admin reads), administration users/audit/settings reads, coupon, shipping-settings and contact-message operations, customer profile, preferences, addresses and public/customer/admin-review operations, inventory operations and a provider-neutral checkout port (`CheckoutProvider`, `PaidCheckoutSession`, `CheckoutSettingsService`); `apps/api` supplies Stripe and Wompi adapters plus the D1/Clerk/Stripe/Wompi-signature specifics (see ADR 0012).
- `agent-core`: shared intent list, deterministic execution planning, mutable-tool authorization, PII redaction, composable Gemini prompts, provider-neutral model execution, conversation-memory ownership, client-gateway cart tool execution, tool-telemetry policy and a Python/LangGraph graph-assembly primitive; Workers and Python container adapters retain their Cloudflare/Gemini/D1/FastAPI bindings.
- `observability`: reusable request-ID, error-status and logger helpers used by API middleware.
- `core`, `schemas`, `api-client`, `ui`, `i18n` and `config-schema` now emit JS/declarations to `dist` and expose package entrypoints. `i18n` provides generic locale/interpolation helpers; the Aether copy is owned by the demo storefront configuration.
- `apps/api/migrations` and `apps/api/src/db/schema.ts` moved to `database/core/` without changing migration filenames or contents. Existing demo migrations remain for deployed-D1 compatibility; `pnpm create:client` now materializes the manifest-selected schema migrations without demo records.

## Compatibility

`formatUsd`, `AetherApiError`, `AetherClientOptions`, `createAetherClient` and
the former `apps/storefront/config/*` entrypoints remain deprecated compatibility
exports. Existing API routes, Worker bindings, environment variables, D1 table
names, historical migrations and deployment resource names remain unchanged.
The Aether storefront and admin resolve the same brand, currency, theme, API,
assistant and portfolio settings from explicit client-owned configuration.

## Main code movements

- `apps/api/src/services/*` -> `packages/api-core/src/{cart,catalog,orders,customers,inventory,webhooks,reviews,contact,coupons,shipping,administration}.ts`, leaving D1, Clerk, and Stripe/Wompi provider-signature adapters in the API app.
- Checkout provider abstraction (ADR 0012): `packages/api-core/src/checkout.ts` now owns the provider-neutral `CheckoutProvider` port, `PaidCheckoutSession` shape and `CheckoutSettingsService`; `apps/api/src/services/{stripe,wompi}.ts` are the two adapters, selected at request time by `apps/api/src/services/checkout-provider.ts`. Admin-managed secrets (`apps/api/src/services/checkout-settings.ts`, AES-GCM via `settings-crypto.ts`) live in `application_settings` and override deploy-time env vars field by field; `apps/admin/components/CheckoutProviderSettings.tsx` and `PUT /api/v1/admin/checkout-settings` are the admin surface.
- assistant intent, provider runtime, memory lifecycle, cart-tool gateway execution, execution planning and audit/counter ordering -> `packages/agent-core/src/`; reusable Python LangGraph assembly -> `packages/agent-core/python/`; D1 persistence and the HTTP gateway remain in `apps/ai-assistant/adapters/` and the Worker.
- package-neutral request IDs, error-status normalization, structured logging and the audit-event contract -> `packages/observability/src/index.ts`.
- API schema and historical migrations -> `database/core/{schema.ts,migrations}`; demo records -> `database/demo/{fixtures,seeds}`.
- Aether branding, store, feature, checkout, integration, navigation and theme configuration -> `config/aether/`; its reusable validation contracts -> `packages/config-schema/`. Storefront legacy configuration entrypoints re-export this configuration while the admin uses a thin local adapter.
- Aether dictionary and locale union -> `apps/storefront/config/dictionaries.ts`; generic interpolation and client-selected locale resolution remain in `packages/i18n/`.

## Validation results

- `pnpm install --frozen-lockfile`: passes on the current migration branch.
- On the current validation checkpoint, `pnpm typecheck`, `pnpm lint`, `pnpm test` (10 tests), `pnpm test:unit` (56 tests), `pnpm openapi:check`, `pnpm validate`, `pnpm build`, `pnpm check:boundaries`, `pnpm test:client-template`, `pnpm test:e2e` and `pnpm test:e2e:assistant` all pass.
- `pnpm test:client-template` packages all nine distributable modules, installs them into a generated temporary client through local tarballs, then runs that client's TypeScript validation. This proves package resolution independently of the monorepo aliases and without publishing packages.
- API and AI Worker `wrangler deploy --dry-run`: pass; no deploy occurred. `python tests/run_direct.py` also passes for the preserved Python/LangGraph runtime.
- `pnpm test:e2e:assistant`: passes (9 desktop checks; one mobile-only case is intentionally excluded from the desktop project).
- `pnpm test:e2e`: passes (19 checks across desktop and mobile; one mobile-only case is intentionally excluded from the desktop project). The E2E server substitutes Clerk only under `AETHER_E2E_STUB_CLERK=true`; production bundles retain the real Clerk integration.
- `python tests/run_direct.py` from `apps/ai-assistant`: passes for the preserved Python/LangGraph runtime.
- Re-validated end-to-end after the Python `agent-core` extraction: `pnpm install --frozen-lockfile`, `pnpm validate`, `pnpm build`, `pnpm test:e2e`, `pnpm test:e2e:assistant` (9/9 desktop, 19/19 desktop+mobile), API and AI Worker `wrangler deploy --dry-run`, and the AI assistant's full CI-mirroring chain (`compileall`, `security_scan.py`, `app.evaluation`, `acceptance_audit.py`, `pytest` at 125/125, `run_direct.py`) all pass with `packages/agent-core/python` wired through `PYTHONPATH`, Docker build context and CI.
- `apps/ai-assistant/scripts/security_scan.py` was hardened to prune skipped directories (`node_modules`, caches) during traversal via `os.walk` instead of filtering after `Path.rglob`, which previously could raise on a dangling `node_modules` symlink/junction unrelated to any scanned source file. Its own dedicated test file continues to cover `scan_file`/`SECRET_PATTERNS` behavior unchanged.
- `.gitignore` gained `apps/storefront/wrangler.production.json` (the other two apps' generated production configs were already ignored; storefront's was missing, leaving it to show up as untracked after each local `wrangler`-config generation) and `.dev.vars`/`.dev.vars.*` (local secret files were previously uncovered by any ignore pattern).
- The AI assistant Docker image build (`docker build -f apps/ai-assistant/Dockerfile .` from the repository root) was not exercised in this validation pass because no local Docker daemon was available; the Dockerfile/compose/CI wiring was reviewed and the CI workflow builds and smoke-tests it on every change under `apps/ai-assistant/**` or `packages/agent-core/python/**`.

## Demo status

Storefront, admin static export, Hono API dry-run, AI Worker dry-run, catalog,
cart, Stripe and Wompi checkout adapters (with admin-managed secrets), auth
middleware, webhooks, inventory routes and existing observability all build
against the same public behavior.

## Releases and clients

Changesets governs SemVer. Use `pnpm changeset`, review the release PR, run
`pnpm version:packages`, then manually trigger `Publish Aether packages` for
GitHub Packages. It is intentionally independent of development/production
deployment workflows.

Create a client with `pnpm create:client <kebab-case-name>`. It creates a
sibling repository starter with validated `config/`, typed app adapter entry
modules, `custom/`, optional database extensions/seeds and schema-only core D1
migrations. The generated package contract is validated against packed package
artifacts before publication. Client upgrades update package versions and run the checks
documented in `docs/platform/upgrading-client.md`.

## Deliberate remaining debt

- Customer profile, addresses, customer-scoped order reads, public/customer/admin-review operations, product overrides, coupon, shipping-settings and contact persistence, inventory, order-status administration, administration reads and idempotent webhook event persistence now have reusable ports. Provider signature verification remains intentionally in the integration adapter.
- The client template has validated configuration, typed framework-neutral app adapters and migration generation. A client still selects and implements the concrete Next.js/Hono/Worker entrypoints and deployment bindings instead of receiving a copied demo.
- The Python/LangGraph container remains a supported adapter alongside the TypeScript Cloudflare Worker. It now consumes the reusable graph-assembly primitive, but its concrete tools, store context, persistence and FastAPI deployment remain client/runtime adapters by design.
- A production publish requires GitHub Packages permission/registry access; the workflow is prepared but was not executed.
