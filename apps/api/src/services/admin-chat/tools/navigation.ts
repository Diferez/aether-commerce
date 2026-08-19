import { z } from "zod";
import { defineAdminChatTool, notFoundResult } from "../define-tool";
import { getProductRow } from "../../products-admin";
import { getCustomerDetail } from "../../customers";
import { pick } from "../language";

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
    // An array of pairs, not z.record() - Gemini's function-calling schema
    // (via LangChain's bindTools) rejects the "propertyNames" keyword zod's
    // JSON Schema output emits for record types, confirmed live (400
    // "Unknown name \"propertyNames\"... Cannot find field").
    filters: z.array(z.object({ key: z.string(), value: z.string() })).optional()
  }),
  run: (args, ctx) => {
    const base = KNOWN_MODULES[args.module];
    const query = args.filters && args.filters.length > 0 ? new URLSearchParams(args.filters.map((f) => [f.key, f.value])).toString() : "";
    const href = query ? `${base}?${query}` : base;
    return Promise.resolve({
      message: pick(
        ctx.language,
        `Here's ${args.module}${query ? " with those filters applied" : ""}.`,
        `Aquí está ${args.module}${query ? " con esos filtros aplicados" : ""}.`
      ),
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
    if (!row) return notFoundResult(ctx, "PRODUCT_NOT_FOUND", "product", "producto");
    const href = `/products/edit/?id=${encodeURIComponent(row.id)}`;
    return { message: pick(ctx.language, `Opening ${row.name}.`, `Abriendo ${row.name}.`), artifact: { type: "navigate", href, label: row.name } };
  }
});

export const openOrderTool = defineAdminChatTool({
  name: "open_order",
  description: "Opens a specific order's detail page by id or order number.",
  schema: z.object({ orderId: z.string().min(1) }),
  requires: { permission: "orders.read" },
  run: async (args, ctx) => {
    // number matched case-insensitively - see orders.ts's loadOrderRow.
    const row = await ctx.env.DB.prepare("select id, number from orders where id = ? or upper(number) = upper(?)")
      .bind(args.orderId, args.orderId)
      .first<{ id: string; number: string }>();
    if (!row) return notFoundResult(ctx, "ORDER_NOT_FOUND", "order", "pedido");
    const href = `/orders/detail/?id=${encodeURIComponent(row.id)}`;
    return { message: pick(ctx.language, `Opening order ${row.number}.`, `Abriendo el pedido ${row.number}.`), artifact: { type: "navigate", href, label: row.number } };
  }
});

export const openCustomerTool = defineAdminChatTool({
  name: "open_customer",
  description: "Opens a specific customer's detail page by id.",
  schema: z.object({ customerId: z.string().min(1) }),
  requires: { permission: "users.read" },
  run: async (args, ctx) => {
    const detail = await getCustomerDetail(ctx.env, args.customerId);
    if (!detail) return notFoundResult(ctx, "CUSTOMER_NOT_FOUND", "customer", "cliente");
    const href = `/customers/detail/?id=${encodeURIComponent(detail.id)}`;
    return {
      message: pick(ctx.language, `Opening ${detail.name ?? detail.email}.`, `Abriendo ${detail.name ?? detail.email}.`),
      artifact: { type: "navigate", href, label: detail.name ?? detail.email }
    };
  }
});

export const focusFormFieldTool = defineAdminChatTool({
  name: "focus_form_field",
  description: "Highlights and focuses a specific field on the form currently open in the admin panel, to help the operator complete it.",
  schema: z.object({ fieldName: z.string().min(1).max(80) }),
  run: (args, ctx) =>
    Promise.resolve({
      message: pick(ctx.language, `Focusing the ${args.fieldName} field.`, `Enfocando el campo ${args.fieldName}.`),
      artifact: { type: "navigate" as const, href: `#field-${encodeURIComponent(args.fieldName)}`, label: args.fieldName }
    })
});
