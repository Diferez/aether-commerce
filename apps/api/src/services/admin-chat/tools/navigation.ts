import { z } from "zod";
import { defineAdminChatTool } from "../define-tool";
import { getProductRow } from "../../products-admin";
import { getCustomerDetail } from "../../customers";

type NavModule = "home" | "orders" | "products" | "inventory" | "customers" | "settings" | "activity";

const KNOWN_MODULES: Record<NavModule, string> = {
  home: "/",
  orders: "/orders/",
  products: "/products/",
  inventory: "/inventory/",
  customers: "/customers/",
  settings: "/settings/",
  activity: "/activity/"
};

export const navigateToTool = defineAdminChatTool({
  name: "navigate_to",
  description:
    "Builds a link to an admin panel module, optionally with filters already applied (e.g. products filtered to out-of-stock). Use this instead of explaining where to click.",
  schema: z.object({
    module: z.enum(["home", "orders", "products", "inventory", "customers", "settings", "activity"]),
    filters: z.record(z.string(), z.string()).optional()
  }),
  run: (args) => {
    const base = KNOWN_MODULES[args.module];
    const query = args.filters ? new URLSearchParams(args.filters).toString() : "";
    const href = query ? `${base}?${query}` : base;
    return Promise.resolve({
      message: `Here's ${args.module}${args.filters ? " with those filters applied" : ""}.`,
      artifact: { type: "navigate" as const, href, label: args.module }
    });
  }
});

export const openProductTool = defineAdminChatTool({
  name: "open_product",
  description: "Opens a specific product's edit page by id.",
  schema: z.object({ productId: z.string().min(1) }),
  requires: { permission: "products.read" },
  run: async (args, ctx) => {
    const row = await getProductRow(ctx.env, args.productId);
    if (!row) return { message: "I could not find that product.", artifact: { type: "error", code: "PRODUCT_NOT_FOUND", message: "Product not found." } };
    const href = `/products/edit/?id=${encodeURIComponent(row.id)}`;
    return { message: `Opening ${row.name}.`, artifact: { type: "navigate", href, label: row.name } };
  }
});

export const openOrderTool = defineAdminChatTool({
  name: "open_order",
  description: "Opens a specific order's detail page by id or order number.",
  schema: z.object({ orderId: z.string().min(1) }),
  requires: { permission: "orders.read" },
  run: async (args, ctx) => {
    const row = await ctx.env.DB.prepare("select id, number from orders where id = ? or number = ?")
      .bind(args.orderId, args.orderId)
      .first<{ id: string; number: string }>();
    if (!row) return { message: "I could not find that order.", artifact: { type: "error", code: "ORDER_NOT_FOUND", message: "Order not found." } };
    const href = `/orders/detail/?id=${encodeURIComponent(row.id)}`;
    return { message: `Opening order ${row.number}.`, artifact: { type: "navigate", href, label: row.number } };
  }
});

export const openCustomerTool = defineAdminChatTool({
  name: "open_customer",
  description: "Opens a specific customer's detail page by id.",
  schema: z.object({ customerId: z.string().min(1) }),
  requires: { permission: "users.read" },
  run: async (args, ctx) => {
    const detail = await getCustomerDetail(ctx.env, args.customerId);
    if (!detail) return { message: "I could not find that customer.", artifact: { type: "error", code: "CUSTOMER_NOT_FOUND", message: "Customer not found." } };
    const href = `/customers/detail/?id=${encodeURIComponent(detail.id)}`;
    return { message: `Opening ${detail.name ?? detail.email}.`, artifact: { type: "navigate", href, label: detail.name ?? detail.email } };
  }
});

export const focusFormFieldTool = defineAdminChatTool({
  name: "focus_form_field",
  description: "Highlights and focuses a specific field on the form currently open in the admin panel, to help the operator complete it.",
  schema: z.object({ fieldName: z.string().min(1).max(80) }),
  run: (args) => Promise.resolve({
    message: `Focusing the ${args.fieldName} field.`,
    artifact: { type: "navigate" as const, href: `#field-${encodeURIComponent(args.fieldName)}`, label: args.fieldName }
  })
});
