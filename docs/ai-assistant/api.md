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

- `assistant.started`
- `assistant.status`
- `assistant.token`
- `assistant.products`
- `assistant.cart_updated`
- `assistant.clarification`
- `assistant.completed`
- `assistant.error`

Payloads:

- `assistant.status`: `{ "message": "..." }`
- `assistant.token`: `{ "text": "..." }` with safe user-visible answer text only.
- `assistant.products`: `ProductCard[]`
- `assistant.cart_updated`: `CartSummary`
- `assistant.clarification`: `{ "message": "..." }`
- `assistant.completed`: full `AssistantResponse`
- `assistant.error`: `{ "message": "...", "retry_after_seconds": 60 }` when rate or concurrency limited, otherwise a safe error message.

The storefront uses `assistant.completed` as the final source of truth and treats earlier events as progressive UI state only.

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

`DELETE /v1/internal/conversations/user/{user_hash}` marks all conversations for a hashed user as deleted and removes stored messages.

`POST /v1/internal/conversations/purge-expired` removes stored messages for conversations past `expires_at` and marks those conversations as expired.

Required header:

```text
x-aether-operations-token: <AI_OPERATIONS_TOKEN>
```
