import type { Address, Cart, Order } from "@aether/schemas";

export type CompletedPaymentSession = {
  id: string;
  amountTotal?: number;
  currency?: string;
  email?: string;
  userId?: string;
  paymentIntentId?: string;
};

export type CreatePaidOrderInput = {
  cart: Cart;
  payment: CompletedPaymentSession;
  paymentProvider: string;
  orderNumberPrefix: string;
  shippingAddress: Address;
  now?: string;
};

/** Derives a stable, customer-facing number without coupling it to a payment provider. */
export function createOrderNumber(sessionId: string, prefix: string): string {
  const suffix = sessionId.replace(/^cs_(test|live)_/, "").slice(0, 10).toUpperCase();
  return `${prefix}-${suffix}`;
}

/**
 * Builds the persistent order payload from a confirmed payment. Database writes
 * and provider-specific webhook verification remain adapter responsibilities.
 */
export function createPaidOrder(input: CreatePaidOrderInput): Order {
  const now = input.now ?? new Date().toISOString();
  const amount = input.payment.amountTotal ?? input.cart.totals.total;
  const currency = (input.payment.currency ?? input.cart.totals.currency).toUpperCase();
  return {
    id: `ord_${input.payment.id}`,
    number: createOrderNumber(input.payment.id, input.orderNumberPrefix),
    ...(input.cart.userId || input.payment.userId ? { userId: input.cart.userId ?? input.payment.userId } : {}),
    email: input.payment.email ?? "customer@example.com",
    state: "paid",
    items: input.cart.items,
    totals: { ...input.cart.totals, total: amount, currency },
    shippingAddress: input.shippingAddress,
    payment: {
      provider: input.paymentProvider,
      providerSessionId: input.payment.id,
      ...(input.payment.paymentIntentId ? { providerPaymentIntentId: input.payment.paymentIntentId } : {}),
      status: "paid",
      amount,
      currency
    },
    createdAt: now,
    updatedAt: now
  };
}

/** Clears the payable balances while preserving the cart identity and actor. */
export function clearPaidCart(cart: Cart): Cart {
  return {
    ...cart,
    items: [],
    totals: { ...cart.totals, subtotal: 0, discount: 0, tax: 0, total: 0 }
  };
}
