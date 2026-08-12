# Aether AI Assistant API

Machine-readable contract: `docs/ai-assistant/openapi.yaml`.

## POST `/v1/assistant/messages`

Request:

```json
{
  "thread_id": "optional-uuid",
  "message": "Muéstrame mouses de menos de 10 dólares",
  "locale": "es-CO",
  "currency": "USD",
  "privacy_consent": true,
  "privacy_version": "2026-08-12",
  "client_context": {
    "current_product_id": null,
    "current_product_slug": null,
    "current_category": null,
    "current_path": "/products"
  }
}
```

Response:

```json
{
  "request_id": "uuid",
  "thread_id": "uuid",
  "message": "Encontré estas opciones reales en Aether.",
  "intent": "SEARCH_PRODUCTS",
  "products": [],
  "cart": null,
  "orders": [],
  "action": {
    "type": "PRODUCTS_LISTED",
    "status": "SUCCEEDED",
    "entity_id": null,
    "message": null
  },
  "suggested_replies": []
}
```

## Streaming

`POST /v1/assistant/messages/stream` emits SSE events:

- `assistant.status`
- `assistant.products`
- `assistant.cart_updated`
- `assistant.completed`
- `assistant.error`

Payloads:

- `assistant.status`: `{ "message": "..." }`
- `assistant.products`: `ProductCard[]`
- `assistant.cart_updated`: `CartSummary`
- `assistant.completed`: full `AssistantResponse`
- `assistant.error`: `{ "message": "..." }` with a safe user-visible error.

The storefront uses `assistant.completed` as the final source of truth and treats earlier events as progressive UI state only.

Signed-in order requests include `Authorization: Bearer <Clerk session token>`. The assistant forwards it only to the shopper-scoped Aether order endpoint; anonymous requests receive `SIGN_IN_REQUIRED`.

HTTP `429` can represent message rate limits, daily budget exhaustion or `concurrency_limit`. Non-streaming responses include `Retry-After` when the service is saturated by active graph executions.

## GET `/metrics`

Returns Prometheus text metrics for assistant requests, LLM calls, tool calls, rate limiting, cart mutations and fallback activity.

## Internal Audit

`GET /v1/internal/audit/events?thread_id=...` or `?request_id=...` returns mutable action audit events.

Required header:

```text
x-aether-operations-token: <AI_OPERATIONS_TOKEN>
```

If `AI_OPERATIONS_TOKEN` is not configured, the endpoint returns `404`.
