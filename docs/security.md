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

- Stripe webhooks require a valid signature with a fresh timestamp.
- Every webhook event is stored in `webhook_events`.
- Idempotency keys are stored and checked before mutating checkout, refunds, or
  order state.

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
