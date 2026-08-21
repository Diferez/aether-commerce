import { calculateCartTotals } from "@aether-commerce/core";
import type { Cart, CartItem, CartItemInput, Coupon, Product } from "@aether-commerce/schemas";

export function createEmptyCart(id: string, currency = "USD"): Cart {
  return {
    id,
    items: [],
    totals: calculateCartTotals([], undefined, 0, 0, currency),
    updatedAt: new Date().toISOString()
  };
}

export function createCartItem(product: Product, input: CartItemInput): CartItem {
  const variant = input.variantId ? product.variants.find((candidate) => candidate.id === input.variantId) : product.variants[0];
  const finalUnitPrice = product.finalPrice + (variant?.priceDelta ?? 0);
  return {
    productId: product.id,
    variantId: variant?.id,
    quantity: input.quantity,
    name: product.name,
    slug: product.slug,
    imageUrl: product.images[0]?.url ?? "",
    unitPrice: product.price,
    finalUnitPrice,
    lineTotal: finalUnitPrice * input.quantity,
    currency: product.currency
  };
}

export function withCartItem(cart: Cart, item: CartItem, coupon?: Coupon): Cart {
  const items = cart.items.some((candidate) => candidate.productId === item.productId && candidate.variantId === item.variantId)
    ? cart.items.map((candidate) =>
        candidate.productId === item.productId && candidate.variantId === item.variantId
          ? {
              ...candidate,
              quantity: Math.min(25, candidate.quantity + item.quantity),
              lineTotal: candidate.finalUnitPrice * Math.min(25, candidate.quantity + item.quantity)
            }
          : candidate
      )
    : [...cart.items, item];
  return { ...cart, items, totals: calculateCartTotals(items, coupon, 0, 0, item.currency) };
}

export function withCoupon(cart: Cart, coupon?: Coupon): Cart {
  return { ...cart, couponCode: coupon?.code, totals: calculateCartTotals(cart.items, coupon, 0, 0, cart.totals.currency) };
}

export function withoutCartItem(cart: Cart, itemId: string, coupon?: Coupon): Cart {
  const items = cart.items.filter((item) => item.productId !== itemId && item.variantId !== itemId && item.slug !== itemId);
  return { ...cart, items, totals: calculateCartTotals(items, coupon, 0, 0, cart.totals.currency) };
}

export function withCartItemQuantity(cart: Cart, itemId: string, quantity: number, coupon?: Coupon): Cart {
  const items = cart.items.map((item) =>
    item.productId === itemId || item.variantId === itemId || item.slug === itemId
      ? { ...item, quantity, lineTotal: item.finalUnitPrice * quantity }
      : item
  );
  return { ...cart, items, totals: calculateCartTotals(items, coupon, 0, 0, cart.totals.currency) };
}
