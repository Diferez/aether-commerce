# Aether AI Assistant Architecture Analysis

## Arquitectura Encontrada

Aether vive en su propio repositorio y se organiza como workspace pnpm.

- Storefront: Next.js exportado como sitio estatico en `apps/storefront`. No usa API routes ni Server Actions para comercio.
- Admin: Next.js estatico en `apps/admin`.
- API: Cloudflare Worker con Hono en `apps/api`, expuesto bajo `/api/v1`.
- Base de datos: Cloudflare D1 con migraciones SQL en `database/core/migrations`.
- Catalogo: adaptador DummyJSON en `apps/api/src/services/catalog.ts`, normalizado con Zod y tipos compartidos.
- Carrito: servicio `apps/api/src/services/cart.ts`, persistido en D1 como JSON en `carts`.
- Checkout: Worker API con Stripe sandbox.
- Auth customer: flujo client-side existente en storefront, con endpoints account/user en Worker.
- Front desplegado: Cloudflare Workers static assets.
- CI/CD: GitHub Actions en `.github/workflows`.

La arquitectura actual no contiene Python, FastAPI, LangGraph, Redis ni PostgreSQL. Por compatibilidad, el asistente debe agregarse como servicio desacoplado en `apps/ai-assistant` y consumir la API existente de Aether. La fuente de verdad sigue siendo el Worker API.

## Componentes Reutilizables

- `GET /api/v1/catalog/products`: busqueda, filtros, paginacion, ordenamiento, precio en centavos y visibilidad.
- `GET /api/v1/catalog/products/:slug`: detalle de producto.
- `GET /api/v1/catalog/categories`: categorias normalizadas.
- `GET /api/v1/cart/:id`: lectura de carrito protegida con `x-aether-cart-token`.
- `POST /api/v1/cart/:id/items`: agregar producto mediante servicio existente.
- `PATCH /api/v1/cart/:id/items/:itemId`: actualizar cantidad.
- `DELETE /api/v1/cart/:id/items/:itemId`: eliminar producto.
- `GET /api/v1/cart/:id/token`: token firmado de carrito para lecturas y mutaciones desde cliente autorizado.
- Tipos Zod en `packages/schemas`.
- Calculo de dinero/carrito en `packages/core`.
- Local cart y eventos `aether-cart-changed` en storefront.

## Modelos Y Datos

- Producto: `Product` en `packages/schemas/src/product.ts`.
- Categoria: objeto embebido en producto con `id`, `slug`, `name`, `image`.
- Marca: campo `brand`, actualmente normalizado como `Aether` o valor nullable.
- Variantes: `product.variants[]` con `id`, `sku`, `priceDelta`, `inventory`, `attributes`.
- Color/talla: no existen como campos dedicados; deben resolverse desde `variant.attributes`, `name`, `value`, `label` o texto normalizado cuando el catalogo los entregue.
- Inventario: `availableStock`, `availabilityStatus`, `inventory.available`, `variants[].inventory`.
- Precios: enteros en centavos USD (`price`, `finalPrice`, `originalPrice`).
- Carrito: `Cart` con `items[]` y `totals`, persistido por `cartId`.

## Cambios Propuestos

1. Crear `apps/ai-assistant` como servicio FastAPI independiente.
2. Crear contratos Pydantic para request/response, productos, carrito, acciones y estado.
3. Crear cliente interno HTTP para consumir Worker API.
4. Implementar herramientas deterministas: buscar productos, detalles, variantes, leer carrito, agregar, eliminar y limpiar.
5. Implementar grafo LangGraph con nodos explicitos y limites configurables.
6. Agregar prompt versionado sin secretos.
7. Integrar widget flotante en storefront con feature flag por URL `NEXT_PUBLIC_AETHER_AI_URL`.
8. Mantener la tienda funcional aunque el servicio IA este apagado.

## Endpoints Reutilizados

- `GET /api/v1/catalog/products`
- `GET /api/v1/catalog/products/:slug`
- `GET /api/v1/cart/:id`
- `GET /api/v1/cart/:id/token`
- `POST /api/v1/cart/:id/items`
- `PATCH /api/v1/cart/:id/items/:itemId`
- `DELETE /api/v1/cart/:id/items/:itemId`

## Endpoints Nuevos

Servicio IA:

- `GET /healthz`
- `GET /readyz`
- `POST /v1/assistant/messages`
- `POST /v1/assistant/messages/stream`
- `GET /v1/assistant/conversations/{thread_id}`
- `DELETE /v1/assistant/conversations/{thread_id}`

## Modelo De Seguridad

- Gemini solo se llama desde el servicio IA; la clave nunca llega al frontend.
- El frontend no envia `user_id`.
- El `cart_id` se deriva del contexto local del storefront, pero toda lectura o mutacion publica exige `x-aether-cart-token` firmado por el Worker. El asistente valida ese token antes de consultar o ejecutar herramientas de carrito.
- Toda mutacion requiere intencion explicita, confianza alta, producto real, variante real e idempotency key.
- El modelo no decide precios, stock ni autorizacion.
- Se redacta PII antes de logs y llamadas al modelo.

## Riesgos

- La lectura y las mutaciones de carrito hechas por el asistente requieren token firmado emitido por el Worker. Si falta o no corresponde al carrito, el asistente pide revalidar la tienda y no consulta el carrito.
- No hay Redis/PostgreSQL existentes; el servicio agrega soporte configurable, con fallback local solo para desarrollo.
- El catalogo DummyJSON no tiene atributos ricos de talla/color en todos los productos; el asistente debe preguntar cuando falten datos.
- Desplegar FastAPI requiere hosting adicional al Worker actual.

## Decisiones

- ADR: el asistente se desacopla como servicio Python para cumplir FastAPI/LangGraph sin meter Node SSR ni secretos en storefront.
- La fuente de verdad comercial sigue en Hono Worker.
- El widget se activa solo si existe URL del asistente; sin URL, no aparece y la tienda sigue normal.
- La primera version usa busqueda, detalles, variantes y carrito reales; checkout sigue fuera del asistente.

## Plan Por Fases

1. Base: servicio FastAPI, contratos, prompt, cliente Worker API, endpoints no streaming.
2. LangGraph: grafo explicito, clasificacion, extraccion, herramientas y respuesta estructurada.
3. Frontend: widget flotante, tarjetas, acciones manuales y sincronizacion de carrito.
4. Persistencia/seguridad: PostgreSQL, Redis, rate limits, auditoria e idempotencia fuerte.
5. Calidad: pruebas unitarias, contrato, e2e, dataset de evaluacion, runbook y despliegue.

## Estado De Implementacion Actual

- Servicio FastAPI creado en `apps/ai-assistant`.
- Grafo LangGraph explicito creado.
- Gemini conectado para clasificacion estructurada con fallback heuristico.
- Herramientas reales para catalogo y carrito creadas sobre Worker API.
- Lecturas y mutaciones de carrito protegidas por token firmado; las mutaciones ademas usan idempotency key.
- Persistencia local SQLite y PostgreSQL opcional.
- Rate limiting local y Redis opcional.
- Widget storefront configurable mediante `NEXT_PUBLIC_AETHER_AI_URL`.
- Metricas Prometheus y logs JSON agregados.
- Dataset inicial de 100 casos creado.
- Imagen Docker, migraciones PostgreSQL versionadas y smoke check de despliegue agregados.
- Prueba E2E del widget agregada con Playwright.

Pendiente para cierre total: despliegue real del servicio Python, evaluacion Gemini programada con cuota controlada y dashboards/alertas operativas conectadas al proveedor final.
