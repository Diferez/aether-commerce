# Aether Commerce

Tienda tecnológica bilingüe desplegable como proyecto independiente en Cloudflare. Este repositorio contiene el storefront, el panel administrativo, el Worker API con D1 y el asistente de ventas; no depende del código fuente del portafolio.

## Aplicaciones

- `apps/storefront`: tienda estática Next.js publicada como Worker con Static Assets.
- `apps/admin`: panel y demo pública exportados para Cloudflare Pages.
- `apps/api`: API Hono en Cloudflare Workers con base D1.
- `apps/ai-assistant`: asistente en Worker y servicio Python/Docker para validación avanzada.
- `packages/*`: contratos, reglas de negocio, configuración, i18n y UI compartidos.

## Desarrollo local

Requiere Node.js 22, pnpm 8.6 y Python 3.12 para las pruebas del asistente.

```bash
pnpm install --frozen-lockfile
pnpm dev:api
pnpm dev:storefront
pnpm dev:admin
```

URLs locales:

- Tienda: `http://localhost:3000`
- Admin: `http://localhost:3001`
- API: `http://localhost:8787/api/v1/health`
- Asistente Python opcional: `http://localhost:8090/healthz`

## Conexión con el portafolio

Los repositorios solo comparten URLs públicas:

- La tienda recibe `NEXT_PUBLIC_PORTFOLIO_URL` y muestra un enlace de regreso.
- El portafolio recibe la URL pública de la tienda como `NEXT_PUBLIC_STORE_URL`.
- `APP_ORIGIN_STORE` autoriza el storefront en el CORS del API.
- `AI_CORS_ALLOWED_ORIGINS` autoriza el storefront en el asistente.

La tienda se construye en `/`; `NEXT_PUBLIC_AETHER_BASE_PATH` y `APP_STORE_BASE_PATH` quedan vacíos en producción.

## Validación

```bash
pnpm validate
pnpm build
pnpm test:e2e:assistant
```

Para el servicio Python:

```bash
cd apps/ai-assistant
python -m pip install -r requirements-docker.txt
python -m compileall app tests scripts
python scripts/security_scan.py
python -m app.evaluation
python tests/run_direct.py
```

La operación del asistente se documenta en `docs/ai-assistant/acceptance-status.md`. Sus valores server-side incluyen `GEMINI_API_KEY`, `DATABASE_URL`, `REDIS_URL` y `AI_ASSISTANT_ENABLED`; el storefront solo recibe `NEXT_PUBLIC_AETHER_AI_URL`. Antes de una ejecución Python respaldada por PostgreSQL, aplica el esquema con `python -m app.migrate`. La evaluación real limitada vive en el workflow `AI Gemini evaluation`.

## Despliegue en Cloudflare

Consulta `docs/deployment.md`. El workflow de producción migra D1 y publica, en orden, API, asistente, storefront y admin. Los secretos se mantienen en GitHub Environments y Cloudflare; nunca se incluyen en variables públicas ni en archivos versionados.

Servicios esperados:

- Storefront: `https://aether-storefront.pickofwow.workers.dev`
- API: `https://aether-api.pickofwow.workers.dev`
- Asistente: `https://aether-ai.pickofwow.workers.dev`
- Admin: `https://aether-admin.pages.dev`

Ejecuta `pnpm deploy:preflight` después de configurar el environment `production` del repositorio.
