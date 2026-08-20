import type { StripeWebhookPayload } from "@aether/api-core";
import type { Env } from "../types";
import { applyRefundLocally } from "./refunds";
import { writeAuditLog } from "./audit";
import { sendDisputeAlertEmail } from "./email";

type StripeChargeOrDispute = NonNullable<NonNullable<StripeWebhookPayload["data"]>["object"]>;

type OrderForSync = {
  channel: string;
  payment_status: string;
  total: number;
  stock_restored_at: string | null;
  email: string;
  number: string;
};

async function findOrderIdByPaymentIntent(env: Env, paymentIntentId: string): Promise<string | null> {
  const payment = await env.DB.prepare("select order_id from payments where provider_reference = ?").bind(paymentIntentId).first<{ order_id: string }>();
  return payment?.order_id ?? null;
}

/**
 * Syncs a refund issued directly in Stripe's own dashboard (not through
 * Aether's admin panel or admin chat) back to the local order - without
 * this, that order stays "paid" forever with no record of what actually
 * happened to the customer's money. Idempotent against a refund Aether
 * itself already applied: only orders still in "paid" get updated, so the
 * webhook arriving after (or racing) an admin-initiated refund is a no-op.
 */
export async function syncChargeRefunded(env: Env, charge: StripeChargeOrDispute, requestId: string): Promise<void> {
  if (!charge.payment_intent) return;
  const orderId = await findOrderIdByPaymentIntent(env, charge.payment_intent);
  if (!orderId) return;

  const order = await env.DB.prepare(
    "select channel, payment_status, total, stock_restored_at, email, number from orders where id = ?"
  )
    .bind(orderId)
    .first<OrderForSync>();
  if (!order || order.payment_status !== "paid") return;

  const amountRefunded = charge.amount_refunded;
  const isFullRefund = amountRefunded === undefined || amountRefunded >= order.total;

  await applyRefundLocally(env, {
    orderId,
    channel: order.channel,
    currentPaymentStatus: order.payment_status,
    totalCents: order.total,
    stockRestoredAt: order.stock_restored_at,
    email: order.email,
    number: order.number,
    amountCents: isFullRefund ? undefined : amountRefunded,
    providerRefundId: charge.id,
    reason: "stripe_webhook:charge.refunded",
    actorId: "stripe",
    requestId,
    source: "stripe_webhook"
  });
}

/**
 * A dispute isn't a refund (no payment_status value represents it - money
 * is contested, not necessarily returned), so this only makes the dispute
 * visible where it would otherwise go unnoticed until Stripe's evidence
 * deadline passed: an audit_logs entry and an email to the store owner.
 */
export async function syncDisputeCreated(env: Env, dispute: StripeChargeOrDispute, requestId: string): Promise<void> {
  const orderId = dispute.payment_intent ? await findOrderIdByPaymentIntent(env, dispute.payment_intent) : null;
  const order = orderId
    ? await env.DB.prepare("select number from orders where id = ?").bind(orderId).first<{ number: string }>()
    : null;

  await writeAuditLog(env, {
    actorId: "stripe",
    action: "order.disputed",
    targetType: "order",
    targetId: orderId,
    payload: { disputeId: dispute.id, requestId, reason: dispute.reason ?? null, status: dispute.status ?? null, source: "stripe_webhook" }
  });
  await sendDisputeAlertEmail(env, {
    disputeId: dispute.id,
    orderNumber: order?.number ?? null,
    ...(dispute.reason !== undefined ? { reason: dispute.reason } : {})
  }).catch(() => {});
}
