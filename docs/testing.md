# Test Plan

## Unit

- Catalog normalization, invalid image cleanup, fallback snapshots.
- Cents math, discounts, coupons, shipping, totals.
- Inventory availability and reservation checks.
- Order state transitions.
- RBAC permissions and demo mutation blocking.
- Zod validation for public inputs.

## Integration

- D1 migrations and seeds.
- Catalog fallback when DummyJSON API times out.
- Clerk JWT mock and role extraction.
- Stripe checkout and webhook signature mock.
- Resend email mock and `email_events` logging.
- Checkout idempotency and duplicate webhook handling.

## E2E

- Browse, search, filter, product detail, cart, coupon, checkout success/cancel.
- Login, cart merge, favorites, compare, account order history.
- Public demo admin reads and blocked mutations.
- Private admin permission checks.

## Security

- Unauthorized access.
- Wrong role.
- Manipulated price or quantity.
- Invalid coupon.
- Duplicate webhook.
- Invalid webhook signature.
- Expired reservation.
- Hidden product access.
- Rate limiting.
- No secrets in client bundle.

## Acceptance Checks

- Catalog falls back to cache or snapshot when DummyJSON is unavailable.
- Product overrides are stored independently from the external source.
- Worker recalculates cart totals and checkout values.
- Public demo admin cannot persist mutations.
- RBAC is checked in Worker middleware.
- API responses use success/error envelopes with request IDs.
