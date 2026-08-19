# ADR 0012: Checkout Provider Abstraction and Wompi Sandbox

## Status

Accepted.

## Decision

Checkout goes through a provider-neutral `CheckoutProvider` port
(`@aether/api-core`), not a Stripe-specific code path. `apps/api` supplies two
adapters, Stripe and Wompi, both mapping their own wire format into a shared
`PaidCheckoutSession` shape (`status`, `amountTotal`, `currency`,
`customerEmail`, `metadata.cartId/userId`, `providerReference`). Order
creation, webhook persistence and the `/checkout/session` and
`/checkout/confirm` routes only ever see that neutral shape; nothing in the
reusable order-creation path branches on which provider ran.

Wompi runs in sandbox/test mode only, the same policy ADR 0007 sets for
Stripe: `prv_test_*` keys, no live payments, until a client explicitly opts
into production Wompi credentials.

Each provider's secret key and webhook/events secret can come from either a
deploy-time Worker secret (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`,
`WOMPI_SECRET_KEY`/`WOMPI_EVENTS_SECRET`) or an admin-panel-managed override
stored encrypted in `application_settings` (AES-GCM, keyed by the
`AETHER_SETTINGS_ENCRYPTION_KEY` Worker secret). The admin-stored value wins
when present, field by field, so pointing the store at a client's own Stripe
or Wompi account never requires a redeploy. The active provider
(`checkout.mode`) is switchable from the same admin surface.

## Consequences

- Adding a third provider means writing one adapter against
  `CheckoutProvider` and mapping its webhook/session shape into
  `PaidCheckoutSession`; no route or order-creation code changes.
- Admin-managed secrets are encrypted at rest and only ever exposed back to
  the admin UI as a masked preview, never the plaintext value.
- `AETHER_SETTINGS_ENCRYPTION_KEY` is itself a deploy-time secret (there is no
  way to admin-manage the key that protects admin-managed secrets); local dev
  without it falls back to deploy-time env vars only, and admin panel writes
  fail with a clear error instead of silently storing plaintext.
