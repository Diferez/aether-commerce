# Package boundaries

- `schemas`: Zod contracts.
- `core`: pure commerce, money, inventory, states and RBAC.
- `api-core`: framework-independent cart operations and commerce ports.
- `agent-core`: intent contracts, guardrails, PII redaction and prompt composition.
- `observability`: request IDs, normalized errors and structured logger contracts.
- `ui`, `i18n`, `api-client`, `config-schema`: reusable presentation, text, transport and safe configuration.

Apps/config own branding, products, provider adapters, deploy config and business copy. Packages never own secrets.
