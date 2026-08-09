# ADR 0003: Public Demo Admin

## Status

Accepted.

## Context

Visitors should be able to inspect the admin experience without risking data
changes or exposing private customer details.

## Decision

Aether ships two admin modes:

- Private admin for authenticated staff with RBAC-protected mutations.
- Public demo admin using anonymized seed data and mutation blockers.

## Consequences

- Every admin mutation must check mode and permissions.
- Demo responses must be clearly labeled.
- Public demo data must never include real customer contact details.
