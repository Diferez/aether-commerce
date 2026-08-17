# Package boundaries

- `schemas`: Zod contracts.
- `core`: pure commerce, money, inventory, states and RBAC.
- `api-core`: framework-independent cart/catalog/order operations and commerce ports. Its checkout port owns provider-neutral session and redirect contracts; Stripe remains an app-level adapter.
- `agent-core`: intent contracts, guardrails, PII redaction and prompt composition.
- `observability`: request IDs, normalized errors and structured logger contracts.
- `ui`, `i18n`, `api-client`, `config-schema`: reusable presentation, text, transport and safe configuration.

Apps/config own branding, products, provider adapters, deploy config and business copy. Packages never own secrets.
