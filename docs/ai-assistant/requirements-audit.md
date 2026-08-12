# Requirements audit

| Requirement | Status | Evidence |
| --- | --- | --- |
| Real LangGraph orchestration | Verified | `worker.ts` imports `StateGraph` and defines explicit conditional nodes. |
| Cloudflare free-plan compatibility | Verified | Wrangler dry-run bundle is below the compressed limit; canary startup measured 18 ms. |
| Grounded catalog/cart | Verified | All tools use the Aether API service binding; tests prohibit fabricated catalog results. |
| Own-order support | Verified | Widget forwards Clerk bearer; Worker calls `/api/v1/orders`; API verifies identity and ownership. |
| Interview regressions | Verified | Spanish, English, French, Italian, cross-user, SQL-injection and unavailable-category cases are tested. |
| Privacy | Verified | Redaction, consent metadata, retention and owner-session deletion use D1. |
| CI/CD | Verified | TypeScript types, lint, tests and Wrangler dry-run build run in CI. |
| Legacy cleanup | Verified | Python, FastAPI, Docker and GHCR image workflow removed. |
