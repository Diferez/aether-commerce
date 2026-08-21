import { z } from "zod";
import { canTransitionFulfillment } from "@aether-commerce/core";
import type { FulfillmentStatus } from "@aether-commerce/schemas";
import { defineAdminChatTool, notFoundResult } from "../define-tool";
import { pick } from "../language";
import type { OrderSummaryArtifact } from "../artifacts";

type OrderRow = {
  id: string;
  number: string;
  email: string;
  state: string;
  payment_status: string;
  fulfillment_status: string;
  total: number;
  currency: string;
  created_at: string;
};

function toSummaryArtifact(row: OrderRow): OrderSummaryArtifact {
  return {
    id: row.id,
    number: row.number,
    email: row.email,
    state: row.state,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    totalCents: row.total,
    currency: row.currency,
    createdAt: row.created_at,
    href: `/orders/detail/?id=${encodeURIComponent(row.id)}`
  };
}

// Mirrors GET /admin/orders' where-clause construction in routes/admin.ts -
// a read-only query shape, not business logic, so it's kept local to this
// tool rather than forcing a refactor of the working REST route to share it.
async function queryOrders(
  db: D1Database,
  filters: { search?: string | undefined; fulfillmentStatus?: string | undefined; paymentStatus?: string | undefined; pageSize: number }
) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.search) {
    where.push("(number like ? or email like ?)");
    const needle = `%${filters.search}%`;
    params.push(needle, needle);
  }
  if (filters.fulfillmentStatus) {
    where.push("fulfillment_status = ?");
    params.push(filters.fulfillmentStatus);
  }
  if (filters.paymentStatus) {
    where.push("payment_status = ?");
    params.push(filters.paymentStatus);
  }
  const whereClause = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const total = await db.prepare(`select count(*) as count from orders ${whereClause}`).bind(...params).first<{ count: number }>();
  const rows = await db
    .prepare(
      `select id, number, email, state, payment_status, fulfillment_status, total, currency, created_at
       from orders ${whereClause} order by created_at desc limit ?`
    )
    .bind(...params, filters.pageSize)
    .all<OrderRow>();
  return { rows: rows.results || [], total: total?.count ?? 0 };
}

export const searchOrdersTool = defineAdminChatTool({
  name: "search_orders",
  description: "Searches orders by number or customer email, with optional fulfillment/payment status filters.",
  schema: z.object({
    query: z.string().max(100).optional(),
    fulfillmentStatus: z.enum(["unfulfilled", "processing", "shipped", "delivered", "cancelled"]).optional(),
    paymentStatus: z.enum(["pending", "paid", "failed", "refunded", "partially_refunded"]).optional(),
    pageSize: z.number().int().min(1).max(25).default(10)
  }),
  requires: { permission: "orders.read" },
  run: async (args, ctx) => {
    const { rows, total } = await queryOrders(ctx.env.DB, {
      search: args.query,
      fulfillmentStatus: args.fulfillmentStatus,
      paymentStatus: args.paymentStatus,
      pageSize: args.pageSize
    });
    const orders = rows.map(toSummaryArtifact);
    if (orders.length === 0) {
      return { message: pick(ctx.language, "No orders matched that search.", "Ningún pedido coincidió con esa búsqueda."), artifact: { type: "order_list", orders: [] } };
    }
    const shortMessage = pick(
      ctx.language,
      `Found ${total} order(s)${total > orders.length ? `, showing the first ${orders.length}` : ""}.`,
      `Se encontraron ${total} pedido(s)${total > orders.length ? `, mostrando los primeros ${orders.length}` : ""}.`
    );
    return {
      message: `${shortMessage}\n${summarizeOrdersForModel(orders)}`,
      artifact: { type: "order_list", orders, displayMessage: shortMessage }
    };
  }
});

export const getOrdersByStatusTool = defineAdminChatTool({
  name: "get_orders_by_status",
  description: "Lists orders filtered to one fulfillment status (e.g. all 'shipped' orders).",
  schema: z.object({
    fulfillmentStatus: z.enum(["unfulfilled", "processing", "shipped", "delivered", "cancelled"]),
    pageSize: z.number().int().min(1).max(25).default(10)
  }),
  requires: { permission: "orders.read" },
  run: async (args, ctx) => {
    const { rows, total } = await queryOrders(ctx.env.DB, { fulfillmentStatus: args.fulfillmentStatus, pageSize: args.pageSize });
    const orders = rows.map(toSummaryArtifact);
    if (orders.length === 0) {
      return {
        message: pick(ctx.language, `No orders are currently ${args.fulfillmentStatus}.`, `Ningún pedido está actualmente en estado "${args.fulfillmentStatus}".`),
        artifact: { type: "order_list", orders: [] }
      };
    }
    const shortMessage = pick(ctx.language, `${total} order(s) are ${args.fulfillmentStatus}.`, `${total} pedido(s) están en estado "${args.fulfillmentStatus}".`);
    return {
      message: `${shortMessage}\n${summarizeOrdersForModel(orders)}`,
      artifact: { type: "order_list", orders, displayMessage: shortMessage }
    };
  }
});

export const getPendingOrdersTool = defineAdminChatTool({
  name: "get_pending_orders",
  description: "Lists orders that still need fulfillment action (unfulfilled or processing), most recent first.",
  schema: z.object({ pageSize: z.number().int().min(1).max(25).default(10) }),
  requires: { permission: "orders.read" },
  run: async (args, ctx) => {
    const { rows, total } = await queryOrders(ctx.env.DB, { fulfillmentStatus: "unfulfilled", pageSize: args.pageSize });
    const orders = rows.map(toSummaryArtifact);
    if (orders.length === 0) {
      return { message: pick(ctx.language, "There are no pending orders right now.", "No hay pedidos pendientes en este momento."), artifact: { type: "order_list", orders: [] } };
    }
    const shortMessage = pick(ctx.language, `${total} order(s) are pending fulfillment.`, `${total} pedido(s) están pendientes de surtir.`);
    return {
      message: `${shortMessage}\n${summarizeOrdersForModel(orders)}`,
      artifact: { type: "order_list", orders, displayMessage: shortMessage }
    };
  }
});

// A list tool's `message` is the ONLY thing the model reads back (the
// artifact is UI-only, see artifacts.ts's displayMessage comment) - a
// bare count like "3 order(s) are pending fulfillment." gives the model
// no way to reference a specific one for a follow-up single-record call
// (get_order_details, prepare_order_status_change, ...) except by
// guessing. Confirmed live in production: the model guessed wrong and the
// whole turn fell back to "I could not finish that request" despite the
// order having already been found. Enumerating numbers here (and keeping
// the short count as displayMessage, unchanged in the UI) is the fix -
// same pattern get_system_health already uses for blocked orders. Kept in
// English regardless of operator language - this half of `message` is
// model-facing reasoning context, never shown to the operator verbatim.
export function summarizeOrdersForModel(orders: OrderSummaryArtifact[]): string {
  return orders
    .map((order) => `- ${order.number}: ${order.fulfillmentStatus}, payment ${order.paymentStatus}, ${(order.totalCents / 100).toFixed(2)} ${order.currency}, ${order.email}`)
    .join("\n");
}

// number matched case-insensitively, id left exact: search_orders' own
// lookup (queryOrders below) matches via SQL LIKE, which SQLite treats as
// case-insensitive for ASCII by default - so a model that retypes an order
// number with different casing (a real, observed failure: "AETH-A1AAOIPCWY"
// reconstructed as a tool-call argument rather than copied byte-for-byte)
// finds it fine via search_orders but got ORDER_NOT_FOUND here and in
// prepare_order_status_change/open_order, which used a case-sensitive `=`.
// Order numbers are generated uppercase and never collide case-insensitively,
// so this loses no precision - it only accepts what should already match.
async function loadOrderRow(db: D1Database, orderIdOrNumber: string) {
  return db
    .prepare(
      "select id, number, email, state, payment_status, fulfillment_status, internal_notes, total, currency, created_at from orders where id = ? or upper(number) = upper(?)"
    )
    .bind(orderIdOrNumber, orderIdOrNumber)
    .first<OrderRow & { internal_notes: string | null }>();
}

function orderNotFoundResult(ctx: { language: "en" | "es" }) {
  return notFoundResult(ctx, "ORDER_NOT_FOUND", "order", "pedido");
}

export const getOrderDetailsTool = defineAdminChatTool({
  name: "get_order_details",
  description: "Gets full details for one order by id or order number.",
  schema: z.object({ orderId: z.string().min(1) }),
  requires: { permission: "orders.read" },
  run: async (args, ctx) => {
    const row = await loadOrderRow(ctx.env.DB, args.orderId);
    if (!row) return orderNotFoundResult(ctx);
    const itemCount = await ctx.env.DB.prepare("select count(*) as count from order_items where order_id = ?")
      .bind(row.id)
      .first<{ count: number }>();
    return {
      message: pick(
        ctx.language,
        `Order ${row.number}: ${row.fulfillment_status}, payment ${row.payment_status}.`,
        `Pedido ${row.number}: ${row.fulfillment_status}, pago ${row.payment_status}.`
      ),
      artifact: {
        type: "order_detail",
        order: { ...toSummaryArtifact(row), internalNotes: row.internal_notes, itemCount: itemCount?.count ?? 0 }
      }
    };
  }
});

export const getOrderTimelineTool = defineAdminChatTool({
  name: "get_order_timeline",
  description: "Gets the status-change history for one order.",
  schema: z.object({ orderId: z.string().min(1) }),
  requires: { permission: "orders.read" },
  run: async (args, ctx) => {
    const row = await loadOrderRow(ctx.env.DB, args.orderId);
    if (!row) return orderNotFoundResult(ctx);
    const history = await ctx.env.DB.prepare(
      "select id, previous_state, new_state, actor_id, reason, created_at from order_status_history where order_id = ? order by created_at asc"
    )
      .bind(row.id)
      .all<{ id: string; previous_state: string | null; new_state: string; actor_id: string; reason: string | null; created_at: string }>();
    const items = (history.results || []).map((entry) => ({
      id: entry.id,
      action: entry.previous_state ? `${entry.previous_state} -> ${entry.new_state}` : entry.new_state,
      targetType: "order",
      targetId: row.id,
      actorId: entry.actor_id,
      // order_status_history never recorded a role (see order_status_history
      // schema) - the card's actor clause still recognizes a provider name
      // like "stripe" as an automated change without one.
      actorRole: null,
      createdAt: entry.created_at
    }));
    return {
      message:
        items.length === 0
          ? pick(ctx.language, `Order ${row.number} has no status history yet.`, `El pedido ${row.number} aún no tiene historial de estado.`)
          : pick(ctx.language, `Order ${row.number} has ${items.length} status change(s).`, `El pedido ${row.number} tiene ${items.length} cambio(s) de estado.`),
      artifact: { type: "activity_list", items }
    };
  }
});

export const getAllowedOrderTransitionsTool = defineAdminChatTool({
  name: "get_allowed_order_transitions",
  description: "Gets which fulfillment statuses an order can legally move to from its current status.",
  schema: z.object({ orderId: z.string().min(1) }),
  requires: { permission: "orders.read" },
  run: async (args, ctx) => {
    const row = await loadOrderRow(ctx.env.DB, args.orderId);
    if (!row) return orderNotFoundResult(ctx);
    const current = row.fulfillment_status as FulfillmentStatus;
    const candidates: FulfillmentStatus[] = ["unfulfilled", "processing", "shipped", "delivered", "cancelled"];
    const allowed = candidates.filter((candidate) => canTransitionFulfillment(current, candidate));
    return {
      message: pick(
        ctx.language,
        allowed.length === 0 ? `Order ${row.number} (${current}) cannot move to any other status.` : `Order ${row.number} can move from ${current} to: ${allowed.join(", ")}.`,
        allowed.length === 0
          ? `El pedido ${row.number} (${current}) no puede pasar a ningún otro estado.`
          : `El pedido ${row.number} puede pasar de ${current} a: ${allowed.join(", ")}.`
      ),
      artifact: { type: "allowed_transitions", current, allowed }
    };
  }
});
