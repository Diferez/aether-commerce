import { z } from "zod";
import { canTransitionFulfillment } from "@aether/core";
import type { FulfillmentStatus } from "@aether/schemas";
import { defineAdminChatTool } from "../define-tool";
import { createPendingAction } from "../pending-actions";
import { writeAuditLog } from "../../audit";
import { buildRestockStatements } from "../../inventory";
import { clearCatalogCache } from "../../catalog";
import type { ActionDiff } from "../artifacts";
import type { PendingActionExecutor } from "../executors";

const FULFILLMENT_STATUSES = ["unfulfilled", "processing", "shipped", "delivered", "cancelled"] as const;

// number matched case-insensitively - see the identical comment on
// orders.ts's loadOrderRow. Confirmed live: prepare_order_status_change was
// the tool that first hit ORDER_NOT_FOUND on a real "Pásalas a procesando"
// turn, immediately after get_pending_orders had just listed the same
// order by number - the model's retyped argument almost certainly drifted
// in case, which this exact-match query had no tolerance for.
async function loadOrderFulfillment(db: D1Database, orderIdOrNumber: string) {
  return db
    .prepare("select id, number, fulfillment_status, stock_restored_at from orders where id = ? or upper(number) = upper(?)")
    .bind(orderIdOrNumber, orderIdOrNumber)
    .first<{ id: string; number: string; fulfillment_status: string; stock_restored_at: string | null }>();
}

// Targets the same fulfillment_status axis the admin panel's own "advance
// status" button already uses (PATCH /admin/orders/:id/fulfillment) - the
// one order-status change actually exposed as a single button in the
// existing UI, and the natural reading of "mark this shipped" in the
// examples this tool needs to support. The order's full state-machine
// (`state` column, PATCH .../status) and payment_status are separate axes
// not covered by this tool.
export const prepareOrderStatusChangeTool = defineAdminChatTool({
  name: "prepare_order_status_change",
  description:
    "Prepares changing an order's fulfillment status (e.g. to 'shipped'). Only offers transitions the order's current status actually allows - if the requested status is invalid, explain why and suggest the real next steps instead of calling this tool.",
  schema: z.object({
    orderId: z.string().min(1),
    fulfillmentStatus: z.enum(FULFILLMENT_STATUSES)
  }),
  requires: { permission: "orders.write", mutation: true },
  run: async (args, ctx) => {
    const order = await loadOrderFulfillment(ctx.env.DB, args.orderId);
    if (!order) return { message: "I could not find that order.", artifact: { type: "error", code: "ORDER_NOT_FOUND", message: "Order not found." } };

    const from = order.fulfillment_status as FulfillmentStatus;
    if (!canTransitionFulfillment(from, args.fulfillmentStatus)) {
      const allowed = FULFILLMENT_STATUSES.filter((candidate) => canTransitionFulfillment(from, candidate));
      return {
        message:
          allowed.length > 0
            ? `Order ${order.number} is ${from} and can't move directly to ${args.fulfillmentStatus}. It can move to: ${allowed.join(", ")}.`
            : `Order ${order.number} is ${from}, which cannot move to any other status.`,
        artifact: { type: "allowed_transitions", current: from, allowed: [...allowed] }
      };
    }

    const diff: ActionDiff = {
      summary: `Mark order ${order.number} as ${args.fulfillmentStatus}`,
      targetLabel: order.number,
      fields: [{ field: "fulfillmentStatus", before: from, after: args.fulfillmentStatus }],
      consequences:
        args.fulfillmentStatus === "cancelled" && !order.stock_restored_at
          ? ["Cancelling restores stock for every item on this order."]
          : []
    };
    const { operationId, expiresAt } = await createPendingAction(ctx.env, {
      conversationId: ctx.conversationId,
      actorId: ctx.actor.userId ?? "admin",
      toolName: "prepare_order_status_change",
      targetType: "order",
      targetId: order.id,
      params: { orderId: order.id, fulfillmentStatus: args.fulfillmentStatus },
      diff,
      requestId: ctx.requestId
    });
    return {
      message: `Ready to mark order ${order.number} as ${args.fulfillmentStatus}. Please confirm.`,
      artifact: { type: "pending_action", operationId, toolName: "prepare_order_status_change", diff, expiresAt }
    };
  }
});

// Re-validates against the order's CURRENT fulfillment_status (not whatever
// it was when prepare_order_status_change ran) - if it moved in the
// meantime, this fails with the same transition-invalid outcome the plain
// REST route would give, rather than trusting the preview was still accurate.
export const executeOrderStatusChange: PendingActionExecutor = async (ctx, params) => {
  const { orderId, fulfillmentStatus } = params as { orderId: string; fulfillmentStatus: FulfillmentStatus };
  const current = await ctx.env.DB.prepare("select fulfillment_status, stock_restored_at from orders where id = ?")
    .bind(orderId)
    .first<{ fulfillment_status: string; stock_restored_at: string | null }>();
  if (!current) return { success: false, code: "ORDER_NOT_FOUND", message: "Order not found." };

  const from = current.fulfillment_status as FulfillmentStatus;
  if (!canTransitionFulfillment(from, fulfillmentStatus)) {
    return { success: false, code: "FULFILLMENT_TRANSITION_INVALID", message: `The order changed - it's now ${from} and can no longer move to ${fulfillmentStatus}.` };
  }

  const shouldRestock = fulfillmentStatus === "cancelled" && current.stock_restored_at === null;
  if (shouldRestock) {
    const restockStatements = await buildRestockStatements(ctx.env, orderId, {
      actorId: ctx.actor.userId ?? "admin",
      requestId: ctx.requestId,
      reason: "admin_chat_fulfillment_cancelled"
    });
    const results = await ctx.env.DB.batch([
      ctx.env.DB.prepare(
        "update orders set fulfillment_status = ?, updated_at = ?, stock_restored_at = CURRENT_TIMESTAMP where id = ? and fulfillment_status = ?"
      ).bind(fulfillmentStatus, new Date().toISOString(), orderId, from),
      ...restockStatements
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      return { success: false, code: "FULFILLMENT_CONFLICT", message: "The order changed while this update was being applied." };
    }
    await clearCatalogCache(ctx.env);
  } else {
    const result = await ctx.env.DB.prepare("update orders set fulfillment_status = ?, updated_at = ? where id = ? and fulfillment_status = ?")
      .bind(fulfillmentStatus, new Date().toISOString(), orderId, from)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      return { success: false, code: "FULFILLMENT_CONFLICT", message: "The order changed while this update was being applied." };
    }
  }

  await writeAuditLog(ctx.env, {
    actorId: ctx.actor.userId ?? "admin",
    action: "order.fulfillment_changed",
    targetType: "order",
    targetId: orderId,
    payload: { from, to: fulfillmentStatus, source: "admin_chat" }
  });

  return { success: true, result: { orderId, previousFulfillmentStatus: from, fulfillmentStatus } };
};
