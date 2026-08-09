// Kept as plain functions (no React, no hooks) so the badge-selection rules
// are unit-testable in isolation from rendering.

// Server-side availabilityStatus uses its own threshold (4, see
// apps/api/src/services/catalog.ts) for a different purpose (inventory
// classification). This threshold is only for whether the storefront shows
// the "low stock" chip, and is intentionally independent of that value.
export const LOW_STOCK_THRESHOLD = 5;

// Some catalogs don't want to expose exact inventory counts to shoppers.
// Flip this to fall back to a generic "last units" copy instead of the
// precise number.
export const EXPOSE_EXACT_STOCK_COUNT = true;

export type ImageBadge = { kind: "none" } | { kind: "out_of_stock" } | { kind: "discount"; percentage: number };

// Exactly one badge lives over the product image. Priority: out of stock
// beats a discount - a discount you can't act on is noise, not information.
export function getImageBadge(product: { availableStock: number; discountPercentage: number }): ImageBadge {
  if (product.availableStock <= 0) {
    return { kind: "out_of_stock" };
  }
  if (product.discountPercentage > 0) {
    return { kind: "discount", percentage: product.discountPercentage };
  }
  return { kind: "none" };
}

export function isLowStock(availableStock: number): boolean {
  return availableStock > 0 && availableStock <= LOW_STOCK_THRESHOLD;
}

export function getLowStockLabel(
  availableStock: number,
  copy: { lowStockCountSingular: string; lowStockCountPlural: string; lowStockGeneric: string }
): string {
  if (!EXPOSE_EXACT_STOCK_COUNT) {
    return copy.lowStockGeneric;
  }
  return availableStock === 1 ? copy.lowStockCountSingular : copy.lowStockCountPlural.replace("{count}", String(availableStock));
}
