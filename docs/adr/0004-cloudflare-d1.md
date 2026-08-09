# ADR 0004: Cloudflare D1

## Status

Accepted.

## Decision

Use Cloudflare D1 for carts, inventory, orders, overrides, audit logs, settings,
emails, webhooks, and idempotency.

## Consequences

D1 keeps the demo free-tier-friendly and close to the Worker. SQL migrations
must remain SQLite-compatible.
