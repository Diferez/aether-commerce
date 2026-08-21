import { z } from "zod";
import { defineAdminChatTool, notFoundResult } from "../define-tool";
import { getCustomerDetail, listCustomersForAdmin } from "../../customers";
import type { AdminCustomerSummary } from "../../customers";
import type { CustomerSummaryArtifact, OrderSummaryArtifact } from "../artifacts";
import { summarizeOrdersForModel } from "./orders";
import { pick } from "../language";
import { getRuntimeStoreConfig } from "../../store-config";

function asString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function toSummaryArtifact(row: AdminCustomerSummary): CustomerSummaryArtifact {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status,
    roles: row.roles,
    orderCount: row.orderCount,
    totalSpentCents: row.totalSpent,
    href: `/customers/detail/?id=${encodeURIComponent(row.id)}`
  };
}

// See orders.ts's summarizeOrdersForModel for why this exists: the model
// only ever reads `message` back, never the artifact, so a bare count
// leaves it unable to reference a specific customer for a follow-up call.
function summarizeCustomersForModel(customers: CustomerSummaryArtifact[]): string {
  return customers.map((customer) => `- ${customer.name ?? customer.email} (${customer.email}): ${customer.orderCount} order(s), ${customer.status}`).join("\n");
}

// Customers are read-only from chat in this phase - there is no existing
// "safe, authorized" customer mutation beyond role/suspend, which are
// already fully committed through their own confirmation UI on the customer
// detail page and are not exposed here.
export const searchCustomersTool = defineAdminChatTool({
  name: "search_customers",
  description: "Searches customers by name or email.",
  schema: z.object({ query: z.string().max(100).optional(), pageSize: z.number().int().min(1).max(25).default(10) }),
  requires: { permission: "users.read" },
  run: async (args, ctx) => {
    const result = await listCustomersForAdmin(ctx.env, { search: args.query, page: 1, pageSize: args.pageSize });
    const customers = result.data.map(toSummaryArtifact);
    if (customers.length === 0) {
      return { message: pick(ctx.language, "No customers matched that search.", "Ningún cliente coincidió con esa búsqueda."), artifact: { type: "customer_list", customers: [] } };
    }
    const shortMessage = pick(
      ctx.language,
      `Found ${result.pagination.total} customer(s)${result.pagination.total > customers.length ? `, showing the first ${customers.length}` : ""}.`,
      `Se encontraron ${result.pagination.total} cliente(s)${result.pagination.total > customers.length ? `, mostrando los primeros ${customers.length}` : ""}.`
    );
    return {
      message: `${shortMessage}\n${summarizeCustomersForModel(customers)}`,
      artifact: { type: "customer_list", customers, displayMessage: shortMessage }
    };
  }
});

export const getCustomerDetailsTool = defineAdminChatTool({
  name: "get_customer_details",
  description: "Gets profile details for one customer by id (no addresses or payment details - use this for a quick summary only).",
  schema: z.object({ customerId: z.string().min(1) }),
  requires: { permission: "users.read" },
  run: async (args, ctx) => {
    const detail = await getCustomerDetail(ctx.env, args.customerId);
    if (!detail) return notFoundResult(ctx, "CUSTOMER_NOT_FOUND", "customer", "cliente");
    const customer: CustomerSummaryArtifact = {
      id: detail.id,
      name: detail.name,
      email: detail.email,
      status: detail.status,
      roles: detail.roles,
      orderCount: detail.orders.length,
      totalSpentCents: detail.orders.reduce((sum, order) => {
        const totals = order.totals as { total?: number } | undefined;
        return sum + (Number(totals?.total) || 0);
      }, 0),
      href: `/customers/detail/?id=${encodeURIComponent(detail.id)}`
    };
    return {
      message: pick(
        ctx.language,
        `${detail.name ?? detail.email}: ${detail.orders.length} order(s), status ${detail.status}.`,
        `${detail.name ?? detail.email}: ${detail.orders.length} pedido(s), estado ${detail.status}.`
      ),
      artifact: { type: "customer_card", customer }
    };
  }
});

export const getCustomerOrderHistoryTool = defineAdminChatTool({
  name: "get_customer_order_history",
  description: "Gets a customer's past orders (order number, status, total) - not their address or payment details.",
  schema: z.object({ customerId: z.string().min(1) }),
  requires: { permission: "users.read" },
  run: async (args, ctx) => {
    const detail = await getCustomerDetail(ctx.env, args.customerId);
    if (!detail) return notFoundResult(ctx, "CUSTOMER_NOT_FOUND", "customer", "cliente");

    // Minimizes what's forwarded (and eventually shown to the model) to
    // exactly what an order-history question needs - order payloads on the
    // customer detail record also carry shippingAddress/payment metadata,
    // which stay out of this artifact entirely.
    const orders: OrderSummaryArtifact[] = detail.orders.map((raw) => {
      const id = asString(raw.id);
      const totals = raw.totals as { total?: number; currency?: string } | undefined;
      return {
        id,
        number: asString(raw.number),
        email: detail.email,
        state: asString(raw.state),
        paymentStatus: asString(raw.paymentStatus),
        fulfillmentStatus: asString(raw.fulfillmentStatus),
        totalCents: Number(totals?.total ?? 0),
        currency: totals?.currency ? asString(totals.currency) : getRuntimeStoreConfig(ctx.env).currency,
        createdAt: asString(raw.createdAt),
        href: `/orders/detail/?id=${encodeURIComponent(id)}`
      };
    });

    if (orders.length === 0) {
      return {
        message: pick(ctx.language, `${detail.name ?? detail.email} has no orders yet.`, `${detail.name ?? detail.email} aún no tiene pedidos.`),
        artifact: { type: "customer_order_history", customerId: detail.id, orders: [] }
      };
    }
    const shortMessage = pick(ctx.language, `${detail.name ?? detail.email} has ${orders.length} order(s).`, `${detail.name ?? detail.email} tiene ${orders.length} pedido(s).`);
    return {
      message: `${shortMessage}\n${summarizeOrdersForModel(orders)}`,
      artifact: { type: "customer_order_history", customerId: detail.id, orders, displayMessage: shortMessage }
    };
  }
});
