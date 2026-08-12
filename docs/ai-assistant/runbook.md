# Aether AI runbook

## Disable

Set `AI_ASSISTANT_ENABLED=false`. Removing `NEXT_PUBLIC_AETHER_AI_URL` from the storefront build hides the widget.

## Health

- `/healthz` identifies the runtime and LangGraph.js version.
- `/readyz` reports whether the API URL and Gemini secret are configured.
- `/metrics` exposes D1-backed request, model, tool, rate-limit, mutation and budget counters.

## Diagnose

Use `request_id` and `thread_id` from the response, then inspect Cloudflare Worker logs, Aether API logs, Gemini quota, and D1 `ai_usage_daily`/`ai_action_audit`. The internal audit endpoint requires `x-aether-operations-token`.

## Privacy

Conversation retention is controlled by `AI_CONVERSATION_RETENTION_DAYS`. Public conversation endpoints require the same hashed session and support deletion. Expired records are purged opportunistically when a user message is persisted.

## Limits

Minute, hour, anonymous/authenticated daily limits and `AI_DAILY_REQUEST_BUDGET` are enforced with hashed D1 buckets. Never log raw bearer or cart tokens.

## Release

Run types, lint, tests and the Wrangler dry-run build. Deploy a separate canary with mutations disabled and its own D1. Test health, languages, cross-user denial, real catalog grounding, chat read/delete, and Gemini. Promote the same source to `aether-ai`; then rebuild/deploy the storefront so Clerk bearer forwarding is live.
