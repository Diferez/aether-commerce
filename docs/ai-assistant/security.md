# Aether AI Assistant Security

- The frontend never receives `GEMINI_API_KEY`.
- CORS is configurable through `AI_CORS_ALLOWED_ORIGINS`. Local development can use `*`; production should list the deployed storefront/admin origins explicitly.
- Product descriptions, user messages and catalog metadata are treated as untrusted content.
- The system prompt explicitly treats user text, catalog fields, reviews, metadata and external API content as untrusted data, never instructions.
- The deterministic intent classifier routes obvious prompt-injection, secret-exfiltration, cross-user, fake-price and nonexistent-product requests to `UNSUPPORTED` before any tool is selected.
- External catalog/cart text is sanitized before entering assistant response contracts: HTML tags, Markdown links, control characters and PII are stripped/redacted, and image URLs are limited to `http`/`https`.
- The model cannot execute generic store actions. Each tool has a strict schema.
- Prices, stock and cart totals are always read from Aether Worker API.
- Mutations require explicit user intent and a deterministic idempotency key.
- Mutable cart requests are blocked when classifier confidence is below `AI_MUTATION_CONFIDENCE_THRESHOLD`; unclear non-mutable requests are clarified below `AI_INTENT_CONFIDENCE_THRESHOLD`.
- PII redaction is enabled by `AI_REDACT_PII=true`.
- Logs avoid full message content unless `AI_LOG_MESSAGE_CONTENT=true`.
- `AI_STORE_CONVERSATIONS=false` disables persisted conversations and message payloads. Mutable cart attempts are still audited without storing user message content.
- Input length is enforced from `AI_MAX_INPUT_CHARACTERS` before the graph executes.
- Checkout and payment collection are outside the assistant. Payment requests are redirected to Aether checkout.
- Rate limiting runs across project, IP, session, conversation and principal scopes. The Docker/FastAPI deployment should configure Redis so limits work across service replicas. The Cloudflare Worker deployment uses D1 hashed buckets for the same short-window controls on the free-tier path.
- Conversations and audit records can use PostgreSQL in production through `DATABASE_URL`.
- Cart reads and mutations from the assistant require a signed cart token. The storefront obtains it from the Worker API and the assistant validates it with the shared `AETHER_CART_TOKEN_SECRET`. Missing or mismatched cart tokens produce a clarification response instead of returning a potentially misleading empty cart.
- Denied cart mutations are audited even when no tool is executed. Missing/invalid cart tokens, low mutation confidence and missing clear-cart confirmation produce blocked audit events.
- Authenticated identity is resolved through Aether `/api/v1/me`. The Worker validates Clerk/JWKS, then the assistant stores only a stable hash of the validated `userId`.
- If `/api/v1/me` does not return a validated user, the request is treated as anonymous and isolated by session/cart headers.
- Public conversation read/delete endpoints authorize access before returning messages. User-owned conversations require the validated user hash; anonymous conversations require the matching session hash.
- Conversation payloads may include a compact `context_summary` with recent product IDs, URLs and display fields. This summary is used only to resolve follow-up references and does not include secrets, payment data, authentication tokens or full user message text when `AI_LOG_MESSAGE_CONTENT=false`.
- Stored user conversations can be deleted by hashed user ID through an internal endpoint protected by `AI_OPERATIONS_TOKEN`.
- Security tests assert that the prompt keeps the core injection controls and that adversarial requests like leaking the Gemini key, revealing internal tools, using fake prices, accessing another cart or adding nonexistent products are rejected as unsupported.
- CI runs `python scripts/security_scan.py` inside the assistant app. The scan fails on secret-like values such as Stripe keys, Google API keys, Clerk secrets, GitHub tokens and JWTs while allowing empty placeholders in `.env.example`.

The standard storefront cart display also sends the signed cart token for `GET /api/v1/cart/:id`, so public cart reads and assistant cart reads share the same ownership check.
