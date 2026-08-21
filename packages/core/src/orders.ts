import type { CartItem, OrderItemSnapshot, Product } from "@aether-commerce/schemas";

export function createOrderItemSnapshot(product: Product, item: CartItem): OrderItemSnapshot {
  return {
    externalProductId: product.externalId,
    productId: product.id,
    productName: product.name,
    productSlug: product.slug,
    productImage: product.thumbnail,
    sku: product.sku,
    selectedVariant: item.variantId ?? null,
    unitPrice: item.finalUnitPrice,
    originalPrice: product.originalPrice,
    discount: Math.max(0, item.unitPrice - item.finalUnitPrice),
    quantity: item.quantity,
    subtotal: item.lineTotal
  };
}

export function publicOrderNumber(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10).replaceAll("-", "");
  const random = crypto.getRandomValues(new Uint32Array(1))[0]?.toString(36).slice(0, 5).toUpperCase() ?? "00000";
  return `AET-${stamp}-${random}`;
}
