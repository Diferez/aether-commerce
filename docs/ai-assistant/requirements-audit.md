# AI Assistant Requirements Audit

Last updated: 2026-07-22

This audit maps the original assistant requirements to current workspace evidence. Status values are conservative:

- `Verified`: direct code, tests, docs, Docker, or runtime evidence exists in this workspace.
- `Blocked`: implementation artifacts exist, but production completion depends on external secrets, real provider access, or deployed runtime evidence.
- `Not complete`: required implementation evidence is missing.

## Requirement Evidence

| Area | Status | Evidence |
| --- | --- | --- |
| Repository inspection before implementation | Verified | `docs/ai-assistant/architecture-analysis.md` documents the existing Aether frontend, Worker API, D1 schema, cart, auth/session model, deployment and test surfaces. |
| Decoupled AI service | Verified | `apps/ai-assistant` is a standalone FastAPI service integrated with Aether through HTTP clients and storefront configuration. |
| Python 3.12/3.13, FastAPI, Pydantic v2, LangGraph, LangChain, Gemini provider | Verified | `pyproject.toml`, `requirements-docker.txt`, `app/main.py`, `app/graph.py`, `app/llm/provider.py`, and the Cloudflare-safe REST Gemini adapter in `app/llm/gemini_rest.py`. |
| Centralized model configuration | Verified | `app/llm/provider.py`, `.env.example`, and `tests/test_llm_provider.py`. |
| Real Gemini availability | Verified | `GEMINI_API_KEY` exists in the GitHub production environment and direct official Gemini API model lookup passed for `models/gemini-3.5-flash`. The Worker runtime uses the official Gemini REST API path so Cloudflare packaging does not need the Google gRPC dependency chain. |
| Required LangGraph nodes and bounded flow | Verified | `app/graph.py`, architecture Mermaid graph, and `tests/test_graph_cart.py` graph-structure coverage. Cloudflare Workers use the same node sequence through a dependency-free local runner when LangGraph packages are not available. |
| Typed state and structured intent classification | Verified | `app/schemas.py`, `app/intent.py`, and `app/llm/intent_classifier.py`. |
| Product search, detail, variant and comparison tools | Verified | `app/tools.py`, `app/clients/aether.py`, and tool/contract tests. |
| Cart read/add/update/remove/clear tools | Verified | `app/tools.py`, signed cart token support, idempotency keys, and cart graph tests. |
| Clear-cart confirmation | Verified | Internal confirmation token in graph/tool layer, covered by `test_tool_clear_cart_requires_confirmation` and graph tests. |
| User/session isolation and cart ownership checks | Verified | Signed cart-token design in `app/cart_token.py`, API client headers, Worker cart-token service, and authorization tests. |
| Response contract for frontend | Verified | `app/schemas.py`, `docs/ai-assistant/api.md`, OpenAPI docs, API contract tests and widget rendering tests. |
| Required assistant API endpoints | Verified | `app/main.py` exposes messages, stream, conversation read/delete, health, readiness, metrics and internal operations endpoints. |
| SSE streaming event contract | Verified | `app/main.py`, API docs, API smoke tests and E2E malformed-stream handling tests. |
| Frontend integration | Verified | `apps/storefront/components/AssistantWidget.tsx`, layout integration and Playwright E2E tests. |
| Product and category context from storefront | Verified | Widget path parsing and E2E tests for product/category context. |
| Prompt safety and prompt injection resistance | Verified | `app/prompts/sales_assistant.py`, `app/security.py`, security docs and adversarial tests/evaluation cases. |
| PII minimization and redaction | Verified | `app/security.py`, evaluation PII metric and security tests. |
| No payment execution by assistant | Verified | Checkout requests are handled as safe guidance; payment-card adversarial evaluation cases pass without payment tools. |
| Timeouts, retries, circuit breaker and degraded responses | Verified | `app/clients/aether.py`, `app/graph.py`, settings and API smoke tests for timeouts/safe errors. |
| Rate limiting, concurrency and daily budget | Verified | `app/rate_limit.py`, storage usage counters, `/metrics`, and API smoke/storage tests. |
| Cache rules for catalog only | Verified | `app/clients/aether.py` caches catalog reads with short TTL and explicitly avoids cart caching; covered by client tests. |
| Structured JSON logs and metrics | Verified | `app/observability.py`, graph logging, `/metrics`, and contract tests for required metric names. |
| OpenTelemetry optional integration | Verified | Settings and dependencies exist; documented as optional and not required for runtime correctness. |
| Mutable action audit | Verified | `ai_action_audit` migration/storage support, internal audit endpoint and graph audit tests. |
| Persistent conversations and retention | Verified | SQLite/PostgreSQL storage adapters, migrations, purge/delete endpoints and storage/API tests. |
| PostgreSQL and Redis production readiness | Blocked | Code and docs support PostgreSQL/Redis; `/readyz` reports production `not_ready` if missing. Real production instances are not configured from this workspace. |
| Unit, contract and integration test coverage | Verified | `tests/run_direct.py` executes security, storage, evaluation, contract, client, graph, tools, migration, API and docs tests. |
| E2E coverage | Verified | `tests/e2e/assistant-widget.spec.ts` covers desktop/mobile widget flows. |
| Evaluation dataset and thresholds | Verified | `evaluation/cases.jsonl` has 100 cases and `python -m app.evaluation` reports thresholds met. |
| Docker image | Verified | `Dockerfile` is multi-stage, non-root and healthchecked; local `docker build` passed. |
| Docker smoke runtime | Verified | Temporary `aether-ai-assistant:test` container started on port 8090 and `python scripts/smoke.py` passed. |
| CI/CD gates | Verified | Root and nested CI run lint, typecheck, tests, security scan, evaluation, acceptance audit, Docker build/smoke, OpenAPI, build and E2E gates. `.github/workflows/ai-assistant-image.yml` builds, smokes and publishes the assistant image to GHCR. |
| Production deployment workflow | Verified | GitHub Actions `Deploy production` completed successfully for the Cloudflare Worker path, applying D1 migrations, deploying Aether API, storefront, admin and `aether-ai`, configuring AI secrets, and verifying API/portfolio/admin/assistant health. |
| Documentation set | Verified | Required docs exist under `docs/ai-assistant/`, with architecture and graph Mermaid diagrams. |
| Feature flags | Verified | `AI_ASSISTANT_ENABLED`, `AI_MUTATIONS_ENABLED`, daily budget and production readiness flags exist and are tested/documented. |
| Store resilience without assistant | Verified | Storefront only enables the widget when `NEXT_PUBLIC_AETHER_AI_URL` is configured; normal cart/store flows remain separate. |
| Production demonstration | Verified | `https://aether-ai.pickofwow.workers.dev/healthz`, `/metrics`, message handling, input-limit rejection and D1-backed rate-limit buckets have been smoke-tested from the deployed Worker. |

## Open Production Items

1. Decide whether the Docker/FastAPI/LangGraph service should also be hosted separately with PostgreSQL and Redis, or whether the free-tier Cloudflare Worker path is the production target.
2. Re-run the limited Gemini classifier evaluation from the deployed runtime.
3. Keep expanding Worker parity for requirements that are already implemented in the Docker/FastAPI path.
