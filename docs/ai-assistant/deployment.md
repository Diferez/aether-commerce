# Aether AI Assistant Deployment

The assistant is a Python service and is deployed separately from the Cloudflare Worker storefront/API.

Required secrets:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_FALLBACK_MODEL` (optional, must be a Gemini model enabled in the same Google AI project)
- `AETHER_CART_TOKEN_SECRET`
- `DATABASE_URL`
- `REDIS_URL`

Cost controls:

- `AI_DEPLOYMENT_ENVIRONMENT=production`
- `AI_ASSISTANT_ENABLED=true`
- `AI_MUTATIONS_ENABLED=true`
- `AI_INTENT_CONFIDENCE_THRESHOLD=0.75`
- `AI_MUTATION_CONFIDENCE_THRESHOLD=0.90`
- `AI_DAILY_REQUEST_BUDGET=`
- `AI_STORE_CONVERSATIONS=true`
- `AI_EVAL_MAX_CASES=10`
- `AI_MAX_INPUT_CHARACTERS=4000`
- `AI_MAX_CONCURRENT_REQUESTS=20`
- `AI_OPERATIONS_TOKEN=`
- `AI_CORS_ALLOWED_ORIGINS=https://your-store.example.com`

Internal API resilience:

- `AI_INTERNAL_HTTP_RETRIES=2`
- `AI_INTERNAL_CIRCUIT_FAILURE_THRESHOLD=3`
- `AI_INTERNAL_CIRCUIT_RESET_SECONDS=30`
- `AI_CATALOG_CACHE_TTL_SECONDS=60`

Required public config for storefront:

- `NEXT_PUBLIC_AETHER_AI_URL`

Required GitHub Actions secrets for Cloudflare deployment:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Required GitHub Actions variables for Cloudflare deployment:

- `CLOUDFLARE_DEPLOY_ENABLED=true`
- `AETHER_D1_DATABASE_ID`
- `NEXT_PUBLIC_AETHER_API_URL`
- `NEXT_PUBLIC_AETHER_AI_URL`
- `NEXT_PUBLIC_PORTFOLIO_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `APP_ORIGIN_STORE`
- `APP_ORIGIN_ADMIN`

Before running the production workflow, verify repository configuration from the repo root:

```bash
pnpm deploy:preflight
```

The preflight checks required GitHub Actions variable and secret names through GitHub CLI without printing secret values. It accepts both repository-level configuration and the `production` GitHub environment configuration used by the deployment workflow.
It also warns when AI assistant production/evaluation settings are incomplete, including `NEXT_PUBLIC_AETHER_AI_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL` and `AI_EVAL_MAX_CASES`. Those AI checks are warnings because the assistant is deployed separately from the Cloudflare storefront/API.

When deploying through GitHub Actions, configure `NEXT_PUBLIC_AETHER_AI_URL` as a repository/environment variable only after the assistant is reachable. The production workflow passes that value into the storefront build and verifies `/healthz` when the variable is present. The workflow also fails early if the Cloudflare secrets are missing, before running expensive build and deploy steps.

## Cloudflare Free Deployment Path

The free-tier deployment target for the assistant is a Cloudflare Worker named `aether-ai`.

- `wrangler.jsonc` deploys `worker.ts` with standard Workers runtime support.
- `worker.ts` exposes the public assistant endpoints used by the storefront widget and calls Gemini through REST.
- The full Python/FastAPI assistant remains available for local Docker/container validation.
- `requirements-docker.txt` is kept for Docker/local/container validation only.
- The Worker build avoids Python packages that are not compatible with Cloudflare Python Worker packaging on the free path. The Docker-only dependency file can keep provider SDKs and LangGraph for local/container validation.
- The Cloudflare Worker deployment uses the existing Aether D1 database through the `DB` binding generated from `AETHER_D1_DATABASE_ID`. Conversation tables are applied by `apps/api/migrations/0005_ai_assistant.sql`; short-window rate-limit buckets are applied by `apps/api/migrations/0006_ai_rate_limits.sql`.
- Supabase can still be configured as a private `DATABASE_URL` secret for the Docker/FastAPI deployment path. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are client-safe values and are not enough for server-side assistant persistence.

The GitHub workflow `.github/workflows/deploy-production.yml` deploys the Worker with Wrangler.

Local run:

```bash
cd apps/ai-assistant
python -m venv .venv
pip install -r requirements-docker.txt
uvicorn app.main:app --reload --port 8090
```

Local Docker run:

```bash
cd apps/ai-assistant
docker compose up --build
```

The local compose stack starts the assistant, PostgreSQL and Redis. The assistant container has a `/healthz` healthcheck and local CORS is limited to the development storefront/admin origins.

If Docker is available only inside WSL, run the validation from the WSL terminal:

```bash
cd /mnt/f/Test/aether-commerce/apps/ai-assistant
docker build -t aether-ai-assistant:test .
docker run --rm -d --name aether-ai-assistant-smoke -p 8090:8090 \
  -e AETHER_API_BASE_URL=https://preview-api.invalid \
  -e AETHER_CART_TOKEN_SECRET=ci-cart-token-secret \
  -e DATABASE_URL= \
  -e REDIS_URL= \
  aether-ai-assistant:test
python3 scripts/smoke.py
docker stop aether-ai-assistant-smoke
```

Some Windows automation environments cannot see the user's WSL distributions even when Docker works in the user's own WSL terminal. In that case, the WSL commands above are the authoritative local Docker check.

Acceptance audit:

```bash
cd apps/ai-assistant
python scripts/acceptance_audit.py
```

The audit reports required artifacts and active production blockers. It can pass artifact checks while still reporting `status: blocked` until Docker, GitHub secrets, Gemini availability and deployment evidence are complete.

Production image build:

```bash
docker build -t aether-ai-assistant:latest .
```

Published image:

```text
ghcr.io/Diferez/aether-ai-assistant:latest
ghcr.io/Diferez/aether-ai-assistant:<commit-sha>
```

The `AI assistant image` GitHub Actions workflow builds the Docker image, runs the local smoke test, then publishes both `latest` and commit-SHA tags to GitHub Container Registry. Use the commit-SHA tag for production rollouts and rollbacks.

Example container host configuration:

```env
PORT=8090
AETHER_API_BASE_URL=https://aether-api.pickofwow.workers.dev
AETHER_CART_TOKEN_SECRET=...
AI_DEPLOYMENT_ENVIRONMENT=production
AI_ASSISTANT_ENABLED=true
AI_MUTATIONS_ENABLED=true
AI_CORS_ALLOWED_ORIGINS=https://aether-storefront.pickofwow.workers.dev
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash-lite
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

Run PostgreSQL migrations before enabling traffic:

```bash
DATABASE_URL=postgresql://... python -m app.migrate
```

By default, production containers do not run migrations automatically. Set `AI_RUN_MIGRATIONS_ON_STARTUP=true` only in controlled environments where a single release task or one replica is allowed to apply migrations before traffic starts. Local `docker compose` enables this flag for convenience.

Smoke check:

```bash
AETHER_AI_URL=https://your-assistant.example.com python scripts/smoke.py
```

The storefront will show the assistant only when `NEXT_PUBLIC_AETHER_AI_URL` is configured.

The smoke script verifies `/healthz`, `/readyz` and `/metrics`. In production, `/readyz` reports `not_ready` until `GEMINI_API_KEY`, `AETHER_CART_TOKEN_SECRET`, PostgreSQL `DATABASE_URL`, `REDIS_URL`, and explicit `AI_CORS_ALLOWED_ORIGINS` are configured.

`AETHER_CART_TOKEN_SECRET` must be the same value in the Aether Worker API and the AI assistant service. Without it, the assistant will not read or mutate carts.

Development can use:

```env
DATABASE_URL=sqlite:///./.data/assistant.sqlite3
```

Production should use PostgreSQL plus Redis. If `DATABASE_URL` is empty, the service falls back to in-memory storage for local demos only. If `REDIS_URL` is empty, rate limits and concurrency limits are in-memory and only suitable for local development.

The assistant image is built with a multi-stage Dockerfile and runs as a non-root user. The local compose file documents baseline CPU and memory limits for the assistant container: 1 vCPU and 768 MB memory limit, with 0.25 vCPU and 256 MB reservation. Adjust these values only after observing request latency, queueing and Gemini/API error rates.

`AI_MAX_CONCURRENT_REQUESTS` limits active assistant graph executions. With Redis configured, the limit is shared across service replicas. Without Redis, it is enforced per local process only.

Catalog and product detail reads use a short in-memory cache controlled by `AI_CATALOG_CACHE_TTL_SECONDS`. Set it to `0` to disable caching. Cart reads, cart mutations, actor lookup, authorization and stock-changing operations are never cached; the Aether Worker API remains the source of truth.

Daily request usage is stored in `ai_usage_daily`. Short-window limits for IP, session, authenticated token, project and conversation are stored as hashed buckets in `ai_rate_limit_buckets`; expired buckets are pruned opportunistically after accepted assistant requests. Configure `AI_DAILY_REQUEST_BUDGET` before public launch if the Gemini project has a strict quota or billing cap.

The Worker rejects messages longer than `AI_MAX_INPUT_CHARACTERS` before D1 counters or Gemini calls are consumed.

Set `AI_STORE_CONVERSATIONS=false` for a stricter privacy mode that disables stored conversation history. In that mode, the assistant still works for single-turn search/help/cart actions, but it cannot use previous product lists to resolve follow-up references across messages.

Configure a scheduled job to call `POST /v1/internal/conversations/purge-expired` with `AI_OPERATIONS_TOKEN`. This enforces `AI_CONVERSATION_RETENTION_DAYS` by deleting stored messages for expired conversations.

Deployment gate:

1. Build image.
2. Publish the image to GHCR through the `AI assistant image` workflow.
3. Run `python -m app.migrate` against production PostgreSQL, or enable `AI_RUN_MIGRATIONS_ON_STARTUP=true` for a controlled one-replica migration task.
4. Start service with `GEMINI_API_KEY`, `AETHER_CART_TOKEN_SECRET`, `DATABASE_URL`, `REDIS_URL`.
5. Run `python scripts/smoke.py`.
6. Configure storefront with `NEXT_PUBLIC_AETHER_AI_URL`.
7. Redeploy the standalone storefront so the widget is included in the static bundle.
