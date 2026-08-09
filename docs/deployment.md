# Despliegue de Aether en Cloudflare

La tienda se despliega desde este repositorio, de forma independiente al portafolio.

## Topología

- `aether-storefront`: Worker con Static Assets generados en `apps/storefront/out`.
- `aether-api`: Worker Hono con binding D1 `DB`.
- `aether-ai`: Worker del asistente con service binding a `aether-api` y el mismo D1.
- `aether-admin`: proyecto de Cloudflare Pages generado desde `apps/admin/out`.

## Configuración pública

Variables del environment `production` en GitHub:

- `CLOUDFLARE_DEPLOY_ENABLED=true`
- `AETHER_D1_DATABASE_ID`
- `AETHER_D1_DATABASE_NAME`
- `AETHER_API_WORKER_NAME=aether-api`
- `AETHER_ADMIN_PAGES_PROJECT=aether-admin`
- `APP_ORIGIN_STORE=https://aether-storefront.pickofwow.workers.dev`
- `APP_ORIGIN_ADMIN=https://aether-admin.pages.dev`
- `NEXT_PUBLIC_AETHER_API_URL=https://aether-api.pickofwow.workers.dev`
- `NEXT_PUBLIC_AETHER_AI_URL=https://aether-ai.pickofwow.workers.dev`
- `NEXT_PUBLIC_PORTFOLIO_URL`: URL del portafolio independiente.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

`APP_STORE_BASE_PATH` y `NEXT_PUBLIC_AETHER_BASE_PATH` quedan vacíos: el storefront vive en la raíz de su propio dominio.

## Secrets

Requeridos:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `AETHER_CART_TOKEN_SECRET`

Según las funciones habilitadas:

- `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER`, `CLERK_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`, `CONTACT_RECIPIENT_EMAIL`
- `GEMINI_API_KEY`, `AI_OPERATIONS_TOKEN`

Usa únicamente Stripe test mode en esta demo.

## D1

Las migraciones versionadas están en `apps/api/migrations`. El workflow genera configuraciones de producción ignoradas por Git y ejecuta:

```bash
pnpm --filter @aether/api db:migrate:remote
```

Para desarrollo local:

```bash
pnpm --filter @aether/api db:migrate:local
pnpm --filter @aether/api db:seed
```

## Publicación

El workflow `.github/workflows/deploy-production.yml` se ejecuta en `main` cuando `CLOUDFLARE_DEPLOY_ENABLED=true`. Antes de activarlo:

```bash
pnpm deploy:preflight
pnpm validate
pnpm build
```

El despliegue verifica las URLs públicas del storefront, API, asistente, admin y portafolio. Si cambia el dominio de la tienda, actualiza a la vez `APP_ORIGIN_STORE`, `AI_CORS_ALLOWED_ORIGINS` y `NEXT_PUBLIC_STORE_URL` en el repositorio del portafolio.
