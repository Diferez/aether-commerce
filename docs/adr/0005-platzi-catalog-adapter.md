# ADR 0005: Platzi Catalog Adapter

## Status

Superseded by [ADR 0011](./0011-dummyjson-catalog-migration.md). The Catalog
Adapter pattern this ADR established is unchanged; only the upstream source
behind it moved from Platzi to DummyJSON.

## Decision

Platzi Fake Store API is consumed only through the Catalog Adapter.

## Consequences

The browser and internal commerce logic depend on Aether contracts, not Platzi
response shapes. Invalid images and unstable fields are normalized.
