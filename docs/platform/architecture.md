# Platform architecture

Aether is a platform monorepo plus the Aether demo reference implementation. Packages contain reusable contracts and pure behavior; `apps/` owns Cloudflare, Next.js, D1 bindings, secrets and Aether-specific adapters.

```text
schemas -> core -> api-core -> apps/api
core -> ui -> storefront/admin
schemas + core + observability -> agent-core -> ai-assistant adapter
```

The public API remains `/api/v1`; Cloudflare resources and the `develop`/`main` deploy flow remain unchanged.
