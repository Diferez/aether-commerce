import type { OrderState } from "@aether/schemas";

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
