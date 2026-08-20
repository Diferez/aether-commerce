import type { Env } from "../types";
import { createRefund as createStripeRefund } from "./stripe";
import { createWompiRefund } from "./wompi";
import { buildRestockStatements } from "./inventory";
import { clearCatalogCache } from "./catalog";
import { writeAuditLog } from "./audit";
import { sendOrderEmail } from "./email";

export type ProviderRefund = {
  id: string;
  status?: string;
};

export type ApplyRefundInput = {
  orderId: string;
  channel: string;
  currentPaymentStatus: string;
  totalCents: number;
  stockRestoredAt: string | null;
  email: string;
  number: string;
  amountCents: number | undefined;
  providerRefundId: string;
  reason?: string;
  actorId: string;
  requestId: string;
  source: "admin" | "admin_chat" | "stripe_webhook";
};

const REFUNDABLE_CHANNELS = new Set(["stripe", "wompi"]);

/** Whether a channel's orders can be refunded through a real payment-provider API at all (whatsapp orders cannot - see order lookup docs). */
export function isRefundableChannel(channel: string): boolean {
  return REFUNDABLE_CHANNELS.has(channel);
}

/** Routes a refund to the right payment provider behind one call, shared by the REST admin route and the admin-chat tool so neither duplicates the dispatch. */
export async function createProviderRefund(
  env: Env,
  channel: string,
  providerPaymentIntentId: string,
  amountCents: number | undefined,
  orderTotalCents: number
): Promise<ProviderRefund> {
  if (channel === "wompi") {
    return createWompiRefund(env, providerPaymentIntentId, amountCents, orderTotalCents);
  }
  return createStripeRefund(env, providerPaymentIntentId, amountCents);
}

/**
 * Applies a refund that has already happened at the payment provider to
 * local order/payment state - the shared tail end of every refund path in
 * this codebase (the admin REST route and the admin-chat tool both call the
 * provider first via createProviderRefund above, then this; the Stripe
 * webhook's charge.refunded handler calls only this, since Stripe already
 * performed the refund itself - see routes/webhooks.ts).
 */
export async function applyRefundLocally(env: Env, input: ApplyRefundInput): Promise<{ paymentStatus: string }> {
  const reason = input.reason ?? `${input.channel}_refund:${input.providerRefundId}`;
  const nextStatus = input.amountCents && input.amountCents < input.totalCents ? "partially_refunded" : "refunded";
  // Only a FULL refund restores stock - a partial refund is ambiguous
  // (could be a shipping/discount adjustment rather than returned goods),
  // and stockRestoredAt guards against restocking twice if this order was
  // already restocked via a fulfillment cancellation.
  const shouldRestock = nextStatus === "refunded" && input.stockRestoredAt === null;
  const restockStatements = shouldRestock
    ? await buildRestockStatements(env, input.orderId, { actorId: input.actorId, requestId: input.requestId, reason })
    : [];

  await env.DB.batch([
    env.DB.prepare(
      shouldRestock
        ? "update orders set payment_status = ?, updated_at = ?, stock_restored_at = CURRENT_TIMESTAMP where id = ?"
        : "update orders set payment_status = ?, updated_at = ? where id = ?"
    ).bind(nextStatus, new Date().toISOString(), input.orderId),
    env.DB.prepare("update payments set status = ?, updated_at = CURRENT_TIMESTAMP where order_id = ?").bind(
      nextStatus === "refunded" ? "refunded" : "paid",
      input.orderId
    ),
    // order_status_history's previous_state/new_state columns are plain
    // TEXT (no CHECK against orderStateSchema) - reused here for the
    // payment-status axis's own audit trail rather than adding a new table.
    env.DB.prepare(
      `insert into order_status_history (id, order_id, previous_state, new_state, actor_id, reason, request_id)
       values (?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), input.orderId, input.currentPaymentStatus, nextStatus, input.actorId, reason, input.requestId),
    ...restockStatements
  ]);
  if (shouldRestock) await clearCatalogCache(env);

  await writeAuditLog(env, {
    actorId: input.actorId,
    action: "order.refunded",
    targetType: "order",
    targetId: input.orderId,
    payload: { paymentStatus: nextStatus, amountCents: input.amountCents ?? input.totalCents, providerRefundId: input.providerRefundId, source: input.source }
  });
  await sendOrderEmail(env, { email: input.email, number: input.number, state: nextStatus }).catch(() => {});
  return { paymentStatus: nextStatus };
}
