# ADR 0011: DummyJSON Catalog Migration

## Status

Accepted. Supersedes [ADR 0005](./0005-platzi-catalog-adapter.md).

## Context

The Platzi Fake Store API was Aether's only external catalog source. It has
no real per-product `stock`, limited category taxonomy, and no reviews,
shipping/warranty/return metadata, or brand data - all of which the storefront
redesign needed to show real, product-sourced information instead of
synthetic copy.

## Decision

Replace Platzi with [DummyJSON](https://dummyjson.com) as the upstream
catalog source, consumed exclusively through the existing Catalog Adapter
(`apps/api/src/services/catalog.ts`) - the adapter boundary from ADR 0005 is
unchanged, only what's behind it moved.

- `PLATZI_API_BASE_URL` is renamed to `DUMMYJSON_API_BASE_URL`
  (`https://dummyjson.com`).
- Product ids are prefixed `dummyjson_<id>` instead of `platzi_<id>`.
  Platzi ids and DummyJSON ids do not refer to the same products, so no
  mapping between them exists or is attempted.
- DummyJSON's `category` field is already a clean slug (e.g. `laptops`,
  `mens-watches`), so category names are now derived from the slug via
  `humanizeCategorySlug()` (`packages/core/src/catalog.ts`) instead of
  Platzi's free-text (and occasionally garbled) category name.
- The effective-stock formula (`normalize()` in `catalog.ts`) is unchanged: it
  remains a deterministic function of the product id, not of the source
  API's stock field. DummyJSON's real `stock` value is preserved separately
  as `externalStock` (informational, admin-facing) rather than replacing the
  formula - see the comment above `normalize()` for the full priority-order
  rationale. This keeps demo behavior stable across catalog syncs.
- New product fields now sourced from DummyJSON and added to the `Product`
  contract: `reviews`, `shippingInformation`, `warrantyInformation`,
  `returnPolicy`, `minimumOrderQuantity`, `weight`, `dimensions`, `brand`,
  and real `sku` values.
- Reviewer emails from DummyJSON's review payloads are dropped during
  normalization and never stored or served.

## Consequences

- Existing localStorage cart/wishlist data (keyed to Platzi ids) is
  incompatible with the new catalog and is cleared once on first load after
  deploy (see `apps/storefront/components/legacy-storage.ts`), with a
  one-time non-intrusive notice shown to the user.
- The image host allowlist (`isTrustedImageUrl`) now trusts
  `cdn.dummyjson.com` instead of `api.escuelajs.co`.
- `docs/adr/0005-platzi-catalog-adapter.md` is kept for history and marked
  superseded rather than deleted.
