# Security Notes

## Client boundary

- No secret values are allowed in `NEXT_PUBLIC_*`.
- The client never sends trusted totals; it sends product IDs, variant IDs,
  quantities, coupon codes, and addresses.
- The Worker recalculates prices, discounts, tax placeholders, shipping, and
  final totals.

## Authentication and authorization

- Clerk JWTs are verified in the Worker.
- Anonymous access is allowed for catalog, cart preview, docs, and public demo
  admin reads.
- Admin routes require `admin` or `staff` roles.
- Private mutations are blocked in demo mode.
- Cart ownership is enforced with signed, expiring cart tokens. Signature checks
  use timing-safe comparison.
- Order history requires an authenticated user session. The API does not support
  order lookup by plain email headers because that enables enumeration.

## Webhooks and idempotency

- Stripe and Wompi webhooks each require a valid provider-specific signature
  (Stripe: HMAC with a fresh timestamp; Wompi: SHA-256 checksum over the
  signed properties, timestamp and events secret) before the payload is
  parsed.
- Every webhook event is stored in `webhook_events`.
- Idempotency keys are stored and checked before mutating checkout, refunds, or
  order state.

## Checkout provider secrets

- Stripe and Wompi secret keys/webhook secrets can be set as deploy-time
  Worker secrets or managed from the admin panel (`settings.manage`
  permission, blocked in demo mode).
- Admin-managed secrets are encrypted at rest (AES-GCM) in
  `application_settings`, keyed by the `AETHER_SETTINGS_ENCRYPTION_KEY` Worker
  secret. That key itself is never admin-managed - it can only be set via
  `wrangler secret put` / deploy config, the same as any other Worker secret.
- The admin API never returns a stored secret's plaintext value, only a
  masked preview (first 6 / last 4 characters) and a configured/not-configured
  status. Saving a new value always requires typing it again.
- A row that fails to decrypt (wrong or rotated `AETHER_SETTINGS_ENCRYPTION_KEY`)
  is treated as not configured and falls back to the deploy-time env var
  rather than breaking checkout.

## Integration secrets (Resend, Gemini, Cloudinary)

- Same mechanism as checkout provider secrets above, same
  `AETHER_SETTINGS_ENCRYPTION_KEY`, same masked-preview/never-plaintext admin
  API, same decrypt-failure-falls-back-to-env-var behavior
  (`services/integration-settings.ts`).
- Covers `RESEND_API_KEY` (transactional email), `GEMINI_API_KEY` (both the
  admin chat assistant and the storefront's own AI assistant), and
  `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`
  (product image uploads) - every secret `aether-api` itself reads at
  request time.
- `apps/ai-assistant` is a separate Worker deployment, but it gets a real D1
  binding at deploy time (`scripts/write-ai-wrangler-config.mjs`) pointing at
  the same physical database `aether-api` uses, so it reads the same
  encrypted `application_settings` row directly (`worker.ts`'s
  `resolveGeminiApiKey`) rather than needing its own settings form or a
  cross-Worker fetch. It needs its own copy of
  `AETHER_SETTINGS_ENCRYPTION_KEY` as a deploy secret to decrypt it.
- Deliberately **not** covered:
  - `NEXT_PUBLIC_SENTRY_DSN` (admin/storefront) and `aether-api`'s own
    `SENTRY_DSN` - the former is inlined into the static-export bundle at
    build time (no server to read a runtime override from); the latter is
    read synchronously by `@sentry/cloudflare`'s `withSentry()` wrapper
    before routing/D1 access is safe to reach for, so resolving it from D1
    would risk breaking error reporting on exactly the requests most likely
    to need it.

## Rate limiting

The API Worker uses Cloudflare Rate Limiting bindings for route-level abuse
protection, with a local in-memory fallback for development and tests:

- General reads: 240 requests/minute.
- Mutations: 60 requests/minute.
- Sensitive routes (`checkout`, `contact`, `webhooks`, `admin`): 20
  requests/minute.

Keys are built from a normalized route plus a hashed authenticated/cart actor
when available, or the connecting IP as a public fallback. For a production
store with real customer traffic, add Cloudflare WAF/API Shield rules at the
zone level as a second layer.

## Data minimization

Demo data should be anonymous. Public admin mode reads seeded records only and
never exposes private customer contact details.
