# ADR 0002: Integer Cents For Money

## Status

Accepted.

## Context

Commerce totals must be deterministic across JavaScript runtimes, D1, Stripe,
tests, and email templates.

## Decision

Aether stores and exchanges money as integer cents with `currency: "USD"` in the
first version.

## Consequences

- No floating-point price math is allowed.
- Formatting is a presentation concern handled by the UI.
- Future multi-currency support requires explicit currency-aware tables.
