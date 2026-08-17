import type { CartItem, CartTotals, Coupon } from "@aether/schemas";

export function clampCents(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function applyPercentageDiscount(price: number, percentage: number): number {
  const normalizedPercentage = Math.min(95, Math.max(0, Math.trunc(percentage)));
  return clampCents(price - Math.floor((price * normalizedPercentage) / 100));
}

export function calculateCouponDiscount(subtotal: number, coupon?: Coupon): number {
  if (!coupon || !coupon.active || subtotal < coupon.minimumSubtotal) {
    return 0;
  }

  if (coupon.type === "fixed") {
    return Math.min(subtotal, coupon.value);
  }

  return Math.min(subtotal, Math.floor((subtotal * coupon.value) / 100));
}

export function calculateCartTotals(
  items: Pick<CartItem, "lineTotal">[],
  coupon?: Coupon,
  shipping = 0,
  tax = 0,
  currency = "USD"
): CartTotals {
  const subtotal = items.reduce((total, item) => total + clampCents(item.lineTotal), 0);
  const discount = calculateCouponDiscount(subtotal, coupon);
  const total = clampCents(subtotal - discount + shipping + tax);

  return {
    subtotal,
    discount,
    shipping: clampCents(shipping),
    tax: clampCents(tax),
    total,
    currency
  };
}

export function formatMoney(cents: number, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency
  }).format(clampCents(cents) / 100);
}

/** @deprecated Use formatMoney(cents, currency, locale) in reusable consumers. */
export function formatUsd(cents: number, locale = "en-US"): string {
  return formatMoney(cents, "USD", locale);
}
