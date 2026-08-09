# AI Assistant Acceptance Status

Last updated: 2026-07-22

This document tracks current evidence for the Aether AI sales assistant implementation. It is intentionally conservative: an item is not considered complete unless there is direct evidence in code, tests, documentation, or runtime behavior.

## Verified In This Workspace

- FastAPI assistant service exists under `apps/ai-assistant`.
- LangGraph-based assistant flow exists in `apps/ai-assistant/app/graph.py`.
- Gemini provider configuration is centralized in `apps/ai-assistant/app/llm/provider.py`.
- Structured API schemas exist in `apps/ai-assistant/app/schemas.py`.
- Catalog and cart clients/tools exist under `apps/ai-assistant/app/clients/` and `apps/ai-assistant/app/tools.py`.
- Persistent storage adapters exist for memory, SQLite, and PostgreSQL in `apps/ai-assistant/app/storage.py`.
- Rate limiting and concurrency control exist in `apps/ai-assistant/app/rate_limit.py`.
- Prompt injection and PII safeguards are documented and covered by security tests.
- Storefront widget integration exists in `apps/storefront/components/AssistantWidget.tsx`.
- Current page context is sent from the widget, including product slugs and category slugs.
- Dockerfile, docker-compose, migrations, OpenAPI docs, runbook, deployment docs, evaluation docs, observability docs, and ADR exist.
- Requirement-by-requirement audit exists in `docs/ai-assistant/requirements-audit.md`.

## Validation Run On 2026-07-21

- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test`: passed.
- `pnpm openapi:check`: passed after documenting signed-token cart reads.
- `pnpm build`: passed after signed-token cart read hardening.
- `python -m compileall app scripts`: passed.
- `python tests/run_direct.py`: passed.
- `python scripts/security_scan.py`: passed.
- `npm run deploy:preflight`: now passes after reading required Cloudflare secrets and assistant settings from the GitHub `production` environment.
- `python -m app.evaluation`: passed on 100 deterministic cases:
  - intent accuracy: 1.0
  - tool selection accuracy: 1.0
  - tool argument accuracy: 1.0
  - cart mutation success rate: 1.0
  - unsafe action rate: 0.0
  - unauthorized mutation rate: 0.0
  - hallucinated product rate: 0.0
  - duplicate mutation rate: 0.0
  - cross-user data leakage rate: 0.0
  - PII redaction matches: 100
  - payment safety matches: 100
- `pnpm exec playwright test tests/e2e/assistant-widget.spec.ts --project=desktop --reporter=line`: passed, 9 tests plus 1 mobile-only skipped test, including structured product rendering, current product/category context, add-to-cart feedback from assistant product cards, keyboard close/focus return, safe handling of malformed stream events, malformed cart-summary rejection, streaming product/cart rendering, product availability display, variant display, and disabled cart mutation for unavailable products.
- `pnpm exec playwright test tests/e2e/assistant-widget.spec.ts --project=mobile --reporter=line`: passed, 10 tests, including the full-screen mobile assistant dialog, input focus, keyboard close/focus return, safe handling of malformed stream events, malformed cart-summary rejection, streaming product/cart rendering, product availability display, variant display, and disabled cart mutation for unavailable products.
- `tests/test_acceptance_docs.py`: passed through `python tests/run_direct.py`, covering required AI assistant docs, Mermaid diagrams, README operations, CI gate documentation, and required environment variable coverage in `.env.example` and `Settings`.
- `tests/test_acceptance_docs.py` also covers that the production workflow builds and smoke-tests the AI assistant image before deployment steps.
- `tests/test_acceptance_docs.py` also covers that the production smoke-test container has a shell cleanup trap, so a failing smoke test does not leave the container running in CI.
- `tests/test_acceptance_docs.py` also covers that the production workflow validates required Cloudflare secrets before expensive build/deploy work.
- `tests/test_acceptance_docs.py` also covers that `npm run deploy:preflight` exists and checks required GitHub Actions deployment variables/secrets by name without exposing secret values.
- `tests/test_api_contract_docs.py`: passed through `python tests/run_direct.py`, covering assistant endpoints, structured response contracts, SSE events, security headers, product-card fields, and the documented `ProductVariant` schema.
- `tests/test_api_smoke.py`: passed through `python tests/run_direct.py`, covering health, readiness, metrics, streaming events, rate limits, internal operations endpoints and production readiness checks.
- `scripts/acceptance_audit.py`: added to report required AI assistant artifacts, evaluation dataset size, and known production blockers in a machine-readable JSON shape.
- `docs/ai-assistant/requirements-audit.md`: maps the original requirements to direct workspace evidence and production blockers.
- `docker version`: passed with Docker Desktop 4.77.0 and Linux engine visible from this workspace.
- `docker build -t aether-ai-assistant:test .`: passed.
- `python scripts/smoke.py`: passed against the temporary Docker container on port 8090.
- Docker image build and container smoke test are now verified locally from this workspace. CI and production workflows also include Docker checks and clean up the test container on failure.
- `PYTHONPYCACHEPREFIX=F:\Freelance\Portafolio\tmp\pycache-check python -m compileall app tests scripts`: passed, avoiding stale locked Windows `__pycache__` files.
- GitHub `production` environment secrets now include `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `GEMINI_API_KEY`; only secret names were verified.
- GitHub `production` environment secrets now also include `DATABASE_URL` and `AETHER_CART_TOKEN_SECRET`; only secret names were verified.
- GitHub `production` environment variables now include `GEMINI_MODEL=gemini-3.5-flash` and `AI_EVAL_MAX_CASES=10`.
- GitHub `production` environment variables now include `NEXT_PUBLIC_AETHER_AI_URL=https://aether-ai.pickofwow.workers.dev`.
- Direct Gemini model lookup against the official Gemini API passed for `models/gemini-3.5-flash` with supported generation methods `generateContent`, `countTokens`, `createCachedContent` and `batchGenerateContent`.
- The Cloudflare free-tier deployment now uses a lightweight TypeScript Worker with Gemini REST, avoiding unsupported Python Worker native dependencies such as `grpcio`, `msgpack` and `pydantic-core`.
- `.github/workflows/ai-assistant-image.yml` exists to build, smoke and publish the assistant Docker image to GitHub Container Registry.
- Runtime storage schema indexes are now aligned with `migrations/0001_initial.sql` and covered by `tests/test_migrations.py` plus `python tests/run_direct.py`.
- Assistant product-card add-to-cart now sends only slug, variant and quantity to the cart API and syncs local cart state from the server-validated cart response.
- Assistant streaming UI now renders product cards, cart summaries and clarification prompts from structured SSE events before the final `assistant.completed` payload.
- Streaming cart updates now render a cart summary with an explicit open-cart action as soon as `assistant.cart_updated` arrives.
- Malformed streaming cart summaries are ignored by the widget instead of being rendered as trusted cart state.
- Cloudflare Worker deployment files now exist for the free-tier assistant target: `worker.ts`, `wrangler.jsonc`, and `.github/workflows/deploy-ai-assistant-cloudflare.yml`.

## Validation Run On 2026-07-22

- GitHub Actions `Deploy production` completed successfully for commit `241f513`, including AI assistant tests, Docker image build/smoke, D1 migrations, Aether API deploy, storefront deploy, admin deploy, AI Worker deploy, secret configuration and health checks.
- GitHub Actions `AI assistant image` completed successfully for commit `241f513`.
- `https://aether-ai.pickofwow.workers.dev/healthz` returned `status: ok`.
- `https://aether-ai.pickofwow.workers.dev/metrics` returned Prometheus metrics including D1-backed rate-limit bucket metrics.
- A deployed Worker request longer than `AI_MAX_INPUT_CHARACTERS` returned HTTP `413`, proving oversized inputs are rejected before Gemini calls.
- The Cloudflare Worker now uses structured intent classification with confidence thresholds and blocks mutable cart actions below `AI_MUTATION_CONFIDENCE_THRESHOLD`.

## Fixes Applied On 2026-07-21

- The assistant widget now detects category context on both standalone storefront routes and merged deployment routes:
  - `/categories/:slug`
  - `/categories/:slug`
- Added an E2E test proving category context is sent to the assistant.
- Updated dynamic Next.js route pages to await `params`, avoiding runtime/build issues with current Next.js dynamic APIs.
- Added an automated graph-structure test proving the required LangGraph control nodes are present.
- Added an automated documentation and CI acceptance test so required assistant docs, diagrams, README operations, minimum pipeline gates, and required environment variables remain covered.
- Added visible add-to-cart feedback in the assistant widget product cards and covered it with E2E.
- Made the assistant widget full-screen on mobile while keeping the compact desktop panel, and covered the mobile layout/focus behavior with E2E.
- Added Escape-key close behavior and focus return to the assistant trigger, covered by desktop and mobile E2E.
- Added safe handling for malformed assistant SSE payloads so invalid JSON produces a generic user-facing error without exposing internal strings.
- Rendered product-card availability and color/size variant data from structured assistant fields, and disabled add-to-cart for unavailable products.
- Added the `ProductVariant` OpenAPI schema and strengthened API contract tests for product-card variant, availability, image, color, size, and rating fields.
- Added a production deployment workflow gate that runs the assistant container smoke test after image build and before Cloudflare deployment steps.
- Added cleanup traps to the AI assistant Docker smoke-test steps in root CI, nested Aether CI, and production deployment workflows.
- Hardened `clear_cart` so the graph must provide an internal confirmation token after the user writes the explicit confirmation phrase; direct tool calls without that token fail and are covered by tests.
- Hardened public cart reads so `GET /api/v1/cart/:id` requires the same signed `x-aether-cart-token` used by cart mutations; storefront cart display, the shared API client and AI assistant cart reads now send that token, and contracts/OpenAPI/docs were updated.
- Hardened the evaluation PII metric so card-redaction cases validate the actual redacted input instead of only trusting the expected fixture flag.
- Added an early production workflow guard for `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and documented the required GitHub Actions variables/secrets.
- Added `npm run deploy:preflight` to verify required GitHub Actions variables and secrets before manually running the production workflow.
- Updated `npm run deploy:preflight` to accept secrets and variables from the GitHub `production` environment, matching the deployment workflow.
- Extended `npm run deploy:preflight` to warn when AI assistant production/evaluation settings are incomplete, including `NEXT_PUBLIC_AETHER_AI_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL` and `AI_EVAL_MAX_CASES`.
- Added production readiness checks so `/readyz` reports `not_ready` when `AI_DEPLOYMENT_ENVIRONMENT=production` and server-side Gemini/PostgreSQL/Redis/cart-token/CORS configuration is incomplete.
- Added a local acceptance audit script so artifact completeness and production blockers are visible before marking the implementation complete.
- Added `scripts/acceptance_audit.py` to CI and production deployment validation before Docker/deploy steps.
- Added `requirements-audit.md` so each major original requirement is tied to direct evidence or a named production blocker.
- Hardened real Gemini evaluation with Windows SelectorEventLoop support, per-case timeouts and safe aggregated failure reasons.
- Added the `AI assistant image` workflow so a validated assistant container can be published to GHCR with both `latest` and commit-SHA tags.
- Aligned the runtime storage schema with the migration indexes for conversation lookup, user deletion, audit lookup and usage reporting.
- Hardened the assistant widget add-to-cart flow so it no longer constructs a local product with assistant-provided prices; E2E now asserts the backend receives the product slug and variant.
- Added E2E coverage proving `assistant.products` streaming events render structured product cards without waiting for the final completed response.
- Added E2E coverage proving `assistant.cart_updated` streaming events render subtotal/item count and expose the cart navigation action.
- Added E2E coverage proving malformed `assistant.cart_updated` payloads do not render cart totals or cart navigation actions.
- Added a Cloudflare Worker deployment path using Wrangler and `worker.ts`; Docker dependencies remain in `requirements-docker.txt` for local/container validation of the full Python assistant.

## Pending Evidence Before Marking Complete

- The Cloudflare Worker production path is deployed and smoke-tested, but the full Docker/FastAPI/LangGraph service has not been separately hosted with production PostgreSQL and Redis.
- Limited Gemini classifier evaluation should be rerun from the deployed runtime.
- Continue expanding Worker parity for requirements that are fully implemented in the Docker/FastAPI path.

## Current Deployment Note

The public Aether storefront, Worker API and Cloudflare Worker AI assistant are deployed and responding. The free-tier production assistant URL is `https://aether-ai.pickofwow.workers.dev`.
