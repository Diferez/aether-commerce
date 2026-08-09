# Aether AI Assistant Runbook

## Disable Assistant

Set:

```env
AI_ASSISTANT_ENABLED=false
```

Remove `NEXT_PUBLIC_AETHER_AI_URL` from storefront build config to hide the widget.

## Readiness

Set `AI_DEPLOYMENT_ENVIRONMENT=production` in production. In that mode `/readyz` reports `not_ready` and lists `readiness_issues` until Gemini, the shared cart token secret, PostgreSQL, Redis and explicit CORS origins are configured.

## Investigate Errors

Use `request_id` and `thread_id` from the response. Check:

- Assistant service logs.
- Aether Worker API logs.
- Gemini quota and 429 responses.
- Redis rate-limit counters.
- Conversation/audit records.

Graph execution logs use the JSON message `assistant_graph_node`. Filter by `request_id` first, then inspect the `node`, `intent`, `tool_name`, `status`, `error_code`, `llm_call_count` and `tool_call_count` fields.

If `AI_OPERATIONS_TOKEN` is configured, query audit events:

```bash
curl -H "x-aether-operations-token: $AI_OPERATIONS_TOKEN" \
  "$AETHER_AI_URL/v1/internal/audit/events?thread_id=<thread_id>"
```

Use `request_id` instead of `thread_id` when investigating a single failed mutation.

## Delete User Conversations

The assistant stores only hashed user IDs. To remove all stored messages for a user, first derive the same stable hash used by the assistant, then run:

```bash
curl -X DELETE -H "x-aether-operations-token: $AI_OPERATIONS_TOKEN" \
  "$AETHER_AI_URL/v1/internal/conversations/user/<user_hash>"
```

If `AI_OPERATIONS_TOKEN` is not configured, this endpoint is unavailable and returns `404`.

## Purge Expired Conversations

Conversation expiration is controlled by `AI_CONVERSATION_RETENTION_DAYS`. Run this endpoint from a scheduled job or release task:

```bash
curl -X POST -H "x-aether-operations-token: $AI_OPERATIONS_TOKEN" \
  "$AETHER_AI_URL/v1/internal/conversations/purge-expired"
```

The endpoint deletes stored messages and marks expired conversations as `expired`.

## Rate Limit

If the assistant returns HTTP `429`, wait for the `Retry-After` value before retrying.

Limits are controlled by:

- `AI_RATE_LIMIT_MESSAGES_PER_MINUTE`
- `AI_RATE_LIMIT_MESSAGES_PER_HOUR`
- `AI_RATE_LIMIT_ANONYMOUS_PER_DAY`
- `AI_RATE_LIMIT_AUTHENTICATED_PER_DAY`
- `AI_DAILY_REQUEST_BUDGET`
- `AI_MAX_CONCURRENT_REQUESTS`

The API checks project, IP, session, conversation, and principal scopes. The conversation scope is applied when the client sends an existing `thread_id`; brand-new conversations are covered by the other scopes until the assistant returns a thread ID. In production, configure `REDIS_URL` so these counters are shared across instances. Local development uses in-memory counters.

If the assistant returns `concurrency_limit`, active graph executions reached `AI_MAX_CONCURRENT_REQUESTS`. Keep the value low enough to protect Gemini and the Aether API, and raise it only after observing healthy latency and error rates.

`AI_DAILY_REQUEST_BUDGET` is a project-level safety switch. When configured, the assistant counts accepted requests in `ai_usage_daily` and rejects new messages with `daily_budget_exceeded` after the daily budget is reached.

If quota usage spikes:

1. Set `AI_ASSISTANT_ENABLED=false` to disable responses.
2. Remove `NEXT_PUBLIC_AETHER_AI_URL` from the storefront build to hide the widget.
3. Review `ai_usage_daily`, `ai_requests_total`, `ai_llm_calls_total`, and Gemini quota errors.
4. Re-enable with a lower `AI_DAILY_REQUEST_BUDGET`.

## Metrics

Open:

```text
GET /metrics
```

Minimum metrics currently exposed:

- `ai_requests_total`
- `ai_requests_active`
- `ai_request_duration_seconds`
- `ai_daily_budget_usage_ratio`
- `ai_daily_budget_requests_remaining`
- `ai_daily_budget_threshold_70_reached`
- `ai_daily_budget_threshold_85_reached`
- `ai_daily_budget_threshold_95_reached`
- `ai_llm_calls_total`
- `ai_llm_duration_seconds`
- `ai_llm_tokens_input_total`
- `ai_llm_tokens_output_total`
- `ai_tool_calls_total`
- `ai_tool_duration_seconds`
- `ai_tool_errors_total`
- `ai_rate_limit_errors_total`
- `ai_cart_mutations_total`
- `ai_cart_mutation_failures_total`
- `ai_clarifications_total`
- `ai_fallback_total`

Token counters are incremented when the configured Gemini/LangChain response includes supported usage metadata. If the provider response shape does not include usage, the counters remain unchanged for that call.

Starter alert rules and dashboard panels are available in:

- `docs/ai-assistant/observability/prometheus-alerts.yml`
- `docs/ai-assistant/observability/grafana-dashboard.json`

Import or adapt those files in the selected production monitoring platform before opening public traffic to the assistant.

## OpenTelemetry

Set `OTEL_ENABLED=true` and configure the standard OTLP exporter environment variables for the target collector. The service name defaults to `aether-ai-assistant`.

## Gemini Busy

Expected user-facing message:

`El asistente está temporalmente ocupado. Puedes seguir navegando y utilizando el carrito normalmente.`

If `GEMINI_FALLBACK_MODEL` is configured and differs from `GEMINI_MODEL`, the assistant tries the fallback model before using the deterministic heuristic classifier. This fallback stays inside Gemini; the service does not switch to another provider silently.

`AI_REQUEST_TIMEOUT_SECONDS` wraps the full graph execution. Non-streaming requests return `504 assistant_timeout` if the graph exceeds that limit; streaming requests emit a safe `assistant.error` event through the same handler.

## Internal Aether API Resilience

Catalog reads use limited retries with backoff and a short circuit breaker:

- `AI_INTERNAL_HTTP_RETRIES`
- `AI_INTERNAL_CIRCUIT_FAILURE_THRESHOLD`
- `AI_INTERNAL_CIRCUIT_RESET_SECONDS`
- `AI_CATALOG_CACHE_TTL_SECONDS`

Cart reads and mutations include the signed cart token, and mutations are not retried automatically. Mutations also include an idempotency key, and the Aether API remains the source of truth.

Set `AI_CATALOG_CACHE_TTL_SECONDS=0` while debugging catalog freshness issues. This affects only catalog/product-detail reads; cart, auth and mutations continue to bypass the cache.

## Deployment Smoke

Run:

```bash
AETHER_AI_URL=https://your-assistant.example.com python scripts/smoke.py
```

The smoke check must pass `/healthz` and `/readyz` before the storefront points `NEXT_PUBLIC_AETHER_AI_URL` at the assistant.
