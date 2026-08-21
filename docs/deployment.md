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
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER`
- `GEMINI_API_KEY`
- `AI_OPERATIONS_TOKEN`

Según las funciones habilitadas:

- `CLERK_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `WOMPI_SECRET_KEY`, `WOMPI_EVENTS_SECRET`
- `AETHER_SETTINGS_ENCRYPTION_KEY` (solo si el panel admin va a gestionar los secretos de checkout y de integraciones -Resend, Gemini, Cloudinary-; ver `docs/security.md`). Se despliega tanto en `aether-api` como en `aether-ai` - este último la necesita para descifrar la misma fila de `application_settings` y así usar el Gemini configurado en el panel también en el asistente de la tienda.
- `RESEND_API_KEY`, `CONTACT_RECIPIENT_EMAIL`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (solo si se habilita la carga de imágenes de producto vía Cloudinary)

Estos tres últimos (`RESEND_API_KEY`, `GEMINI_API_KEY`, y los tres de Cloudinary) también se pueden configurar - o rotar - desde el panel admin (Configuración → Integraciones), sin volver a desplegar: el valor guardado ahí (cifrado en D1) tiene prioridad sobre la variable de entorno. Para `GEMINI_API_KEY` esto aplica tanto al chat del admin (`aether-api`) como al asistente de la tienda (`aether-ai`) - un solo valor guardado cubre ambos.

Usa únicamente modo de prueba/sandbox en esta demo, tanto en Stripe como en Wompi.

## D1

Las migraciones versionadas están en `database/core/migrations`. El workflow genera configuraciones de producción ignoradas por Git y ejecuta:

```bash
pnpm --filter @aether-commerce/api db:migrate:remote
```

Para desarrollo local:

```bash
pnpm --filter @aether-commerce/api db:migrate:local
pnpm --filter @aether-commerce/api db:seed
```

## Publicación

El workflow `.github/workflows/deploy-production.yml` se ejecuta después de que `Aether CI` termina correctamente en `main`. También permite ejecución manual desde `main`. Si falta configuración, el preflight falla mostrando solo los nombres ausentes en vez de omitir silenciosamente el despliegue. Antes de activarlo:

```bash
pnpm deploy:preflight
pnpm validate
pnpm build
```

El despliegue verifica las URLs públicas del storefront, API, asistente, admin y portafolio. Si cambia el dominio de la tienda, actualiza a la vez `APP_ORIGIN_STORE`, `AI_CORS_ALLOWED_ORIGINS` y `NEXT_PUBLIC_STORE_URL` en el repositorio del portafolio.

## Ambiente de desarrollo

El workflow `.github/workflows/deploy-development.yml` se ejecuta después de que `Aether CI` termina correctamente en `develop` y publica recursos separados:

- `aether-storefront-dev`
- `aether-api-dev`
- `aether-ai-dev`
- branch deploy `develop` de Cloudflare Pages para admin
- D1 `aether-development`

Consulta `docs/development.md` para configurar variables, secrets y el flujo PR -> `develop` -> `main`.
