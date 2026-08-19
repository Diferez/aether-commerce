import { z } from "zod";
import { defineAdminChatTool, notFoundResult } from "../define-tool";
import { createPendingAction } from "../pending-actions";
import { pick } from "../language";
import { writeAuditLog } from "../../audit";
import { createRefund } from "../../stripe";
import { buildRestockStatements } from "../../inventory";
import { clearCatalogCache } from "../../catalog";
import { sendOrderEmail } from "../../email";
import type { ActionDiff } from "../artifacts";
import type { PendingActionExecutor } from "../executors";
import type { AdminChatContext } from "../context";

type OrderRefundRow = {
  channel: string;
  payment_status: string;
  payload_json: string;
  total: number;
  stock_restored_at: string | null;
  email: string;
  number: string;
};

async function loadOrderForRefund(db: D1Database, orderIdOrNumber: string): Promise<{ id: string; row: OrderRefundRow } | null> {
  const row = await db
    .prepare("select id, channel, payment_status, payload_json, total, stock_restored_at, email, number from orders where id = ? or upper(number) = upper(?)")
    .bind(orderIdOrNumber, orderIdOrNumber)
    .first<OrderRefundRow & { id: string }>();
  if (!row) return null;
  const { id, ...rest } = row;
  return { id, row: rest };
}

function extractPaymentIntentId(payloadJson: string): string | undefined {
  try {
    const payload = JSON.parse(payloadJson) as { payment?: { providerPaymentIntentId?: string } };
    return payload.payment?.providerPaymentIntentId;
  } catch {
    return undefined;
  }
}

function refundPrecondition(ctx: Pick<AdminChatContext, "language">, order: OrderRefundRow): { code: string; message: string } | null {
  if (order.channel !== "stripe") {
    return { code: "REFUND_NOT_APPLICABLE", message: pick(ctx.language, "Only Stripe orders can be refunded through Stripe.", "Solo los pedidos de Stripe se pueden reembolsar a través de Stripe.") };
  }
  if (order.payment_status !== "paid" && order.payment_status !== "partially_refunded") {
    return { code: "REFUND_NOT_APPLICABLE", message: pick(ctx.language, "Only a paid order can be refunded.", "Solo un pedido pagado se puede reembolsar.") };
  }
  if (!extractPaymentIntentId(order.payload_json)) {
    return { code: "REFUND_MISSING_PAYMENT_INTENT", message: pick(ctx.language, "This order has no Stripe payment intent to refund.", "Este pedido no tiene un payment intent de Stripe para reembolsar.") };
  }
  return null;
}

// Mirrors POST /admin/orders/:id/refund's own preconditions exactly
// (routes/admin.ts) - the actual Stripe API call only happens once the
// operator confirms (executeRefundOrder below), same "no side effect until
// confirmed" rule every other prepare_* tool in this codebase follows. This
// one is the one exception whose executor still calls an external API (not
// just D1) - the real REST route already carries that same shape, this
// tool just gates it behind a confirmation step first.
export const prepareRefundOrderTool = defineAdminChatTool({
  name: "prepare_refund_order",
  description: "Prepares refunding a paid Stripe order, in full or a partial amount. Returns a preview that must be confirmed before Stripe is charged.",
  schema: z.object({
    orderId: z.string().min(1).describe("The order id or order number"),
    amountCents: z.number().int().min(1).optional().describe("Partial refund amount in cents - omit for a full refund"),
    reason: z.string().max(300).optional()
  }),
  requires: { permission: "refunds.create", mutation: true },
  run: async (args, ctx) => {
    const found = await loadOrderForRefund(ctx.env.DB, args.orderId);
    if (!found) return notFoundResult(ctx, "ORDER_NOT_FOUND", "order", "pedido");
    const precondition = refundPrecondition(ctx, found.row);
    if (precondition) return { message: precondition.message, artifact: { type: "error", code: precondition.code, message: precondition.message } };

    const amount = args.amountCents ?? found.row.total;
    const isPartial = args.amountCents !== undefined && args.amountCents < found.row.total;
    const diff: ActionDiff = {
      summary: pick(
        ctx.language,
        `Refund $${(amount / 100).toFixed(2)}${isPartial ? " (partial)" : ""} on order ${args.orderId}`,
        `Reembolsar $${(amount / 100).toFixed(2)}${isPartial ? " (parcial)" : ""} del pedido ${args.orderId}`
      ),
      targetLabel: args.orderId,
      fields: [
        { field: "amountCents", before: null, after: amount },
        { field: "paymentStatus", before: found.row.payment_status, after: isPartial ? "partially_refunded" : "refunded" }
      ],
      consequences: isPartial
        ? []
        : [pick(ctx.language, "A full refund restores stock for every item on this order.", "Un reembolso total restaura el stock de todos los artículos de este pedido.")]
    };
    const { operationId, expiresAt } = await createPendingAction(ctx.env, {
      conversationId: ctx.conversationId,
      actorId: ctx.actor.userId ?? "admin",
      toolName: "prepare_refund_order",
      targetType: "order",
      targetId: found.id,
      params: { orderId: found.id, amountCents: args.amountCents, reason: args.reason },
      diff,
      requestId: ctx.requestId
    });
    return {
      message: pick(ctx.language, `Ready to refund $${(amount / 100).toFixed(2)} on this order. Please confirm.`, `Listo para reembolsar $${(amount / 100).toFixed(2)} de este pedido. Por favor confirma.`),
      artifact: { type: "pending_action", operationId, toolName: "prepare_refund_order", diff, expiresAt }
    };
  }
});

// Re-validates against the order's CURRENT payment_status/channel/payment
// intent (not the snapshot prepare_refund_order saw) before ever calling
// Stripe - if the order changed in the meantime, this fails the same way
// the plain REST route would rather than trusting a stale preview.
export const executeRefundOrder: PendingActionExecutor = async (ctx, params) => {
  const { orderId, amountCents, reason } = params as { orderId: string; amountCents?: number; reason?: string };
  const current = await ctx.env.DB.prepare(
    "select channel, payment_status, payload_json, total, stock_restored_at, email, number from orders where id = ?"
  )
    .bind(orderId)
    .first<OrderRefundRow>();
  if (!current) return { success: false, code: "ORDER_NOT_FOUND", message: pick(ctx.language, "Order not found.", "Pedido no encontrado.") };

  const precondition = refundPrecondition(ctx, current);
  if (precondition) return { success: false, code: precondition.code, message: precondition.message };
  const paymentIntentId = extractPaymentIntentId(current.payload_json)!;

  try {
    const refund = await createRefund(ctx.env, paymentIntentId, amountCents);
    const nextStatus = amountCents && amountCents < current.total ? "partially_refunded" : "refunded";
    const shouldRestock = nextStatus === "refunded" && current.stock_restored_at === null;
    const restockStatements = shouldRestock
      ? await buildRestockStatements(ctx.env, orderId, { actorId: ctx.actor.userId ?? "admin", requestId: ctx.requestId, reason: reason ?? `stripe_refund:${refund.id}` })
      : [];

    await ctx.env.DB.batch([
      ctx.env.DB.prepare(
        shouldRestock
          ? "update orders set payment_status = ?, updated_at = ?, stock_restored_at = CURRENT_TIMESTAMP where id = ?"
          : "update orders set payment_status = ?, updated_at = ? where id = ?"
      ).bind(nextStatus, new Date().toISOString(), orderId),
      ctx.env.DB.prepare("update payments set status = ?, updated_at = CURRENT_TIMESTAMP where order_id = ?").bind(nextStatus === "refunded" ? "refunded" : "paid", orderId),
      ctx.env.DB.prepare(
        `insert into order_status_history (id, order_id, previous_state, new_state, actor_id, reason, request_id)
         values (?, ?, ?, ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), orderId, current.payment_status, nextStatus, ctx.actor.userId ?? "admin", reason ?? `stripe_refund:${refund.id}`, ctx.requestId),
      ...restockStatements
    ]);
    if (shouldRestock) await clearCatalogCache(ctx.env);

    await writeAuditLog(ctx.env, {
      actorId: ctx.actor.userId ?? "admin",
      action: "order.refunded",
      targetType: "order",
      targetId: orderId,
      payload: { paymentStatus: nextStatus, amountCents: amountCents ?? current.total, stripeRefundId: refund.id, source: "admin_chat" }
    });
    await sendOrderEmail(ctx.env, { email: current.email, number: current.number, state: nextStatus }).catch(() => {});
    return { success: true, result: { orderId, paymentStatus: nextStatus, stripeRefundId: refund.id } };
  } catch (error) {
    return { success: false, code: "STRIPE_REFUND_FAILED", message: error instanceof Error ? error.message : pick(ctx.language, "Stripe refund failed.", "El reembolso de Stripe falló.") };
  }
};
