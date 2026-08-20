import { z } from "zod";
import { defineAdminChatTool, notFoundResult } from "../define-tool";
import { createPendingAction } from "../pending-actions";
import { pick } from "../language";
import { applyRefundLocally, createProviderRefund, isRefundableChannel } from "../../refunds";
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
  if (!isRefundableChannel(order.channel)) {
    return { code: "REFUND_NOT_APPLICABLE", message: pick(ctx.language, "Only Stripe or Wompi orders can be refunded through their payment provider.", "Solo los pedidos de Stripe o Wompi se pueden reembolsar a través de su proveedor de pago.") };
  }
  if (order.payment_status !== "paid" && order.payment_status !== "partially_refunded") {
    return { code: "REFUND_NOT_APPLICABLE", message: pick(ctx.language, "Only a paid order can be refunded.", "Solo un pedido pagado se puede reembolsar.") };
  }
  if (!extractPaymentIntentId(order.payload_json)) {
    return { code: "REFUND_MISSING_PAYMENT_INTENT", message: pick(ctx.language, "This order has no payment reference to refund.", "Este pedido no tiene una referencia de pago para reembolsar.") };
  }
  return null;
}

// Mirrors POST /admin/orders/:id/refund's own preconditions exactly
// (routes/admin.ts) - the actual provider API call only happens once the
// operator confirms (executeRefundOrder below), same "no side effect until
// confirmed" rule every other prepare_* tool in this codebase follows. This
// one is the one exception whose executor still calls an external API (not
// just D1) - the real REST route already carries that same shape, this
// tool just gates it behind a confirmation step first.
export const prepareRefundOrderTool = defineAdminChatTool({
  name: "prepare_refund_order",
  description: "Prepares refunding a paid Stripe or Wompi order. Stripe supports a partial amount; Wompi only supports a full refund. Returns a preview that must be confirmed before the payment provider is charged.",
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
    const refund = await createProviderRefund(ctx.env, current.channel, paymentIntentId, amountCents, current.total);
    const { paymentStatus } = await applyRefundLocally(ctx.env, {
      orderId,
      channel: current.channel,
      currentPaymentStatus: current.payment_status,
      totalCents: current.total,
      stockRestoredAt: current.stock_restored_at,
      email: current.email,
      number: current.number,
      amountCents,
      providerRefundId: refund.id,
      ...(reason !== undefined ? { reason } : {}),
      actorId: ctx.actor.userId ?? "admin",
      requestId: ctx.requestId,
      source: "admin_chat"
    });
    return { success: true, result: { orderId, paymentStatus, providerRefundId: refund.id } };
  } catch (error) {
    return { success: false, code: "REFUND_FAILED", message: error instanceof Error ? error.message : pick(ctx.language, "Refund failed.", "El reembolso falló.") };
  }
};
