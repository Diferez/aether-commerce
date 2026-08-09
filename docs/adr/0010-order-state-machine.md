# ADR 0010: Order State Machine

## Status

Accepted.

## Decision

All order transitions use an explicit state machine and write
`order_status_history` with actor, reason, request ID, and metadata.
