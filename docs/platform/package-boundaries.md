# Package boundaries

- `schemas`: Zod contracts.
- `core`: pure commerce, money, inventory, states and RBAC.
- `api-core`: framework-independent cart/catalog/order operations, customer preferences, inventory and commerce ports. Its checkout port owns provider-neutral session/redirect contracts and settings (mode + credentials) merging; Stripe and Wompi remain app-level adapters, each mapping its own wire format onto the neutral session shape (ADR 0012). `apps/api/src/services/webhooks.ts` (status/attempt/retry tracking, admin-visible event list) is the reference app's actual webhook-event persistence today, not `api-core`'s `WebhookEventService` - the package still exports it as reusable library surface, but nothing in this repo demonstrates using it. Likewise `ProductOverrideService`, `AdminOrderReadService` and `AdministrationService` remain exported but unused: `apps/api/src/routes/admin.ts` uses direct D1 queries and dedicated app services (`products-admin.ts`, `customers.ts`, `audit.ts`, `system-health.ts`) instead, since the reference store's product/admin architecture moved off the override-based model these ports were designed for.
- `agent-core`: intent contracts, guardrails, PII redaction, prompt composition and provider-neutral model execution.
- `observability`: request IDs, normalized errors and structured logger contracts.
- `ui`, `i18n`, `api-client`, `config-schema`: reusable presentation, text, transport and safe configuration.

Apps/config own branding, products, provider adapters, deploy config and business copy. Packages never own secrets.

`pnpm check:boundaries` rejects platform imports of application internals, package `src` deep imports and direct cross-app imports. Public package subpaths must be declared explicitly (currently `@aether-commerce/ui/theme`).
