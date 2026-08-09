# ADR 0009: Catalog Cache Strategy

## Status

Accepted.

## Decision

Use Worker cache where available, D1 `products_cache`, and TanStack Query client
cache. If DummyJSON fails, Aether falls back to the latest valid snapshot.
