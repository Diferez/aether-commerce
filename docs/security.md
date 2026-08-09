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

## Webhooks and idempotency

- Stripe webhooks require a valid signature.
- Every webhook event is stored in `webhook_events`.
- Idempotency keys are stored and checked before mutating checkout, refunds, or
  order state.

## Rate limiting

The Worker includes a lightweight IP and route rate limiter for free-tier-safe
abuse protection. For a production store, move rate limits to Cloudflare WAF or
a dedicated durable store if volume requires it.

## Data minimization

Demo data should be anonymous. Public admin mode reads seeded records only and
never exposes private customer contact details.
