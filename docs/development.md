# Ambiente de desarrollo de Aether Commerce

`main` representa producción. Usa `develop` para validar cambios completos de tienda antes de promoverlos.

## Flujo recomendado

1. Crea una rama de feature desde `develop`.
2. Abre PR contra `develop`.
3. CI ejecuta typecheck, lint, tests, OpenAPI, build y pruebas del asistente.
4. Al mergear en `develop`, GitHub Actions despliega el ambiente de desarrollo en Cloudflare.
5. Revisa storefront, admin, API y asistente.
6. Abre PR de `develop` a `main` para producción.

## Servicios esperados

- Storefront desarrollo: `https://aether-storefront-dev.pickofwow.workers.dev`
- API desarrollo: `https://aether-api-dev.pickofwow.workers.dev`
- Asistente desarrollo: `https://aether-ai-dev.pickofwow.workers.dev`
- Admin desarrollo: `https://develop.aether-admin.pages.dev`

Producción conserva:

- Storefront: `https://aether-storefront.pickofwow.workers.dev`
- API: `https://aether-api.pickofwow.workers.dev`
- Asistente: `https://aether-ai.pickofwow.workers.dev`
- Admin: `https://aether-admin.pages.dev`

## GitHub Environment `development`

Variables:

- `CLOUDFLARE_DEPLOY_ENABLED=true`
- `AETHER_API_WORKER_NAME=aether-api-dev`
- `AETHER_AI_WORKER_NAME=aether-ai-dev`
- `AETHER_FRONT_WORKER_NAME=aether-storefront-dev`
- `AETHER_ADMIN_PAGES_PROJECT=aether-admin`
- `AETHER_D1_DATABASE_NAME=aether-development`
- `AETHER_D1_DATABASE_ID`: ID de la base D1 de desarrollo.
- `APP_ORIGIN_STORE=https://aether-storefront-dev.pickofwow.workers.dev`
- `APP_ORIGIN_ADMIN=https://develop.aether-admin.pages.dev`
- `NEXT_PUBLIC_AETHER_API_URL=https://aether-api-dev.pickofwow.workers.dev`
- `NEXT_PUBLIC_AETHER_AI_URL=https://aether-ai-dev.pickofwow.workers.dev`
- `NEXT_PUBLIC_PORTFOLIO_URL=https://portafolio-aether-commerce-dev.pickofwow.workers.dev`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: publishable key de Clerk test/dev.

Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `AETHER_CART_TOKEN_SECRET`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER`
- `GEMINI_API_KEY`
- `AI_OPERATIONS_TOKEN`

Opcionales según funciones habilitadas:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `CONTACT_RECIPIENT_EMAIL`

Usa llaves de test/dev. No reutilices secretos productivos en este environment.

## Base D1 de desarrollo

Crea una D1 separada:

```bash
pnpm exec wrangler d1 create aether-development
```

Guarda el `database_id` resultante como `AETHER_D1_DATABASE_ID` en el environment `development`.

## Validación local

```bash
pnpm install --frozen-lockfile
pnpm validate
pnpm build
```

Para probar D1 local:

```bash
pnpm db:migrate:local
pnpm db:seed
```
