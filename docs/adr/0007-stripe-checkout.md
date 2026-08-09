# ADR 0007: Stripe Checkout Sandbox

## Status

Accepted.

## Decision

Use Stripe Checkout in test mode only. The Worker creates sessions, verifies
webhooks, and stores idempotent payment events.
