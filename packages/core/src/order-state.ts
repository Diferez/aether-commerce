import type { FulfillmentStatus, OrderState, PaymentStatus } from "@aether-commerce/schemas";

const transitions: Record<OrderState, OrderState[]> = {
  draft: ["pending_payment", "cancelled"],
  pending_payment: ["payment_processing", "payment_failed", "cancelled"],
  payment_processing: ["paid", "payment_failed"],
  payment_failed: ["pending_payment", "cancelled"],
  paid: ["processing", "refund_requested"],
  processing: ["packed", "cancelled", "refund_requested"],
  packed: ["shipped", "cancelled"],
  shipped: ["in_transit", "delivered", "refund_requested"],
  in_transit: ["out_for_delivery", "delivered", "return_requested"],
  out_for_delivery: ["delivered", "return_requested"],
  delivered: ["return_requested", "refund_requested", "closed"],
  refund_requested: ["partially_refunded", "refunded"],
  partially_refunded: ["refunded", "closed"],
  return_requested: ["returned", "closed"],
  returned: ["refunded", "closed"],
  cancelled: [],
  refunded: [],
  closed: []
};

export function canTransitionOrder(from: OrderState, to: OrderState): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function assertOrderTransition(from: OrderState, to: OrderState): void {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`Invalid order transition: ${from} -> ${to}`);
  }
}

// Separate, smaller state machine for the fulfillment_status column
// (migration 0015) - independent of the `state`/canTransitionOrder above,
// which stays the source of truth for the Stripe webhook and PATCH
// .../status. This one only governs the two new fulfillment-focused routes.
const fulfillmentTransitions: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  unfulfilled: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: []
};

export function canTransitionFulfillment(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return fulfillmentTransitions[from]?.includes(to) ?? false;
}

// payment_status transitions the admin can make directly via PATCH
// .../payment - deliberately narrow. Marking something "paid" without a
// real payment reference only makes sense for a WhatsApp order the admin
// is confirming by hand; a Stripe order's payment_status only ever moves
// through the dedicated refund endpoint (POST .../refund), never this
// route - enforced by the route handler checking channel, not just this
// state table.
const paymentTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ["paid", "failed"],
  failed: ["pending"],
  paid: ["refunded", "partially_refunded"],
  partially_refunded: ["refunded"],
  refunded: []
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return paymentTransitions[from]?.includes(to) ?? false;
}
