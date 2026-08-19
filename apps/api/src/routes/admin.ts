import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { checkoutProviderIds } from "@aether/api-core";
import {
  canTransitionFulfillment,
  canTransitionOrder,
  canTransitionPayment,
  isValidHexColor,
  isValidWhatsappNumber
} from "@aether/core";
import { orderStateSchema } from "@aether/schemas";
import type { AppBindings } from "../types";
import { collection, fail, ok } from "../http";
import { requirePermission } from "../middleware/admin";
import { clearCatalogCache } from "../services/catalog";
import { createInventoryService } from "../services/inventory";
import { createCouponService } from "../services/coupons";
import { createReviewModerationService } from "../services/review-moderation";
import { createCheckoutSettingsService } from "../services/checkout-settings";
import { summarizeCheckoutSettings } from "../services/checkout-provider";
import { createUploadSignature } from "../services/cloudinary";
import { createManualOrder } from "../services/orders";
import { createRefund } from "../services/stripe";
import { buildRestockStatements } from "../services/inventory";
import { getCustomerDetail, listCustomersForAdmin, setCustomerRole, setCustomerStatus } from "../services/customers";
import { writeAuditLog } from "../services/audit";
import { computeSystemHealth } from "../services/system-health";
import {
  adjustProductInventory,
  bulkSetVisibility,
  createProduct,
  deleteProduct,
  getProductRow,
  listProductsForAdmin,
  setProductVisibility,
  updateProduct
} from "../services/products-admin";

const productImageSchema = z.object({ main: z.string().min(1), gallery: z.array(z.string().min(1)).default([]) });

const productWriteSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(80).optional(),
  sku: z.string().min(1).max(40).optional(),
  brand: z.string().max(80).nullable().optional(),
  category: z.string().min(1).max(60),
  subcategory: z.string().max(60).nullable().optional(),
  shortDescription: z.string().min(1).max(300),
  description: z.string().min(1).max(5000),
  highlights: z.array(z.string().min(1)).max(10).optional(),
  specs: z.record(z.string(), z.string()).optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
  variants: z.array(z.object({ type: z.string().min(1), options: z.array(z.string().min(1)).min(1) })).optional(),
  images: productImageSchema,
  seoTitle: z.string().max(160).optional(),
  seoDescription: z.string().max(300).optional(),
  priceCents: z.number().int().min(0),
  compareAtPriceCents: z.number().int().min(0).nullable().optional(),
  stock: z.number().int().min(0),
  lowStockThreshold: z.number().int().min(0).optional(),
  visibility: z.enum(["draft", "visible", "hidden"]).optional(),
  featured: z.boolean().optional(),
  isNew: z.boolean().optional(),
  isDeal: z.boolean().optional()
});
// compareAtPriceCents, when present, is the struck-through reference price -
// it must be strictly higher than what the shopper actually pays, or the
// "discount" shown on the storefront would be negative/nonsensical.
const productWriteSchemaValidated = productWriteSchema.refine(
  (value) => value.compareAtPriceCents == null || value.compareAtPriceCents > value.priceCents,
  { message: "compareAtPriceCents must be greater than priceCents", path: ["compareAtPriceCents"] }
);
const productPatchSchema = productWriteSchema.partial().refine(
  (value) =>
    value.compareAtPriceCents == null ||
    value.priceCents == null ||
    value.compareAtPriceCents > value.priceCents,
  { message: "compareAtPriceCents must be greater than priceCents", path: ["compareAtPriceCents"] }
);

const checkoutCredentialsUpdateSchema = z.object({
  secretKey: z.string().min(1).optional(),
  webhookSecret: z.string().min(1).optional()
});

const checkoutSettingsUpdateSchema = z.object({
  mode: z.enum(checkoutProviderIds).optional(),
  stripe: checkoutCredentialsUpdateSchema.optional(),
  wompi: checkoutCredentialsUpdateSchema.optional()
});

function sanitizeCredentials(credentials?: z.infer<typeof checkoutCredentialsUpdateSchema>) {
  if (!credentials) return undefined;
  return {
    ...(credentials.secretKey !== undefined ? { secretKey: credentials.secretKey } : {}),
    ...(credentials.webhookSecret !== undefined ? { webhookSecret: credentials.webhookSecret } : {})
  };
}

/** zod's .optional() output type carries explicit `| undefined`; strip it so exactOptionalPropertyTypes accepts the merge input. */
function sanitizeCheckoutSettingsUpdate(input: z.infer<typeof checkoutSettingsUpdateSchema>) {
  const stripe = sanitizeCredentials(input.stripe);
  const wompi = sanitizeCredentials(input.wompi);
  return {
    ...(input.mode !== undefined ? { mode: input.mode } : {}),
    ...(stripe !== undefined ? { stripe } : {}),
    ...(wompi !== undefined ? { wompi } : {})
  };
}

export const adminRoutes = new Hono<AppBindings>();

adminRoutes.get("/demo/summary", (c) =>
  ok(c, {
    mode: "demo",
    notice: {
      en: "Public demo mode. Changes are disabled.",
      es: "Modo de demostracion publica. Los cambios estan deshabilitados."
    },
    revenue: 1842500,
    orders: 128,
    conversionRate: 4.8,
    lowStock: 7
  })
);

adminRoutes.get("/summary", requirePermission("orders.read"), async (c) => {
  const lowStock = await c.env.DB.prepare(
    "select count(*) as count from products where stock > 0 and stock <= low_stock_threshold"
  ).first<{ count: number }>();
  return ok(c, {
    mode: "private",
    revenue: 1842500,
    orders: 128,
    conversionRate: 4.8,
    lowStock: lowStock?.count ?? 0
  });
});

adminRoutes.get("/dashboard", requirePermission("orders.read"), async (c) => {
  const lowStock = await createInventoryService(c.env.DB).countLowStock();
  return ok(c, {
    revenue: 1842500,
    orders: 128,
    averageTicket: 14395,
    productsSold: 344,
    conversionRate: 4.8,
    lowStock,
    orderStates: [
      { state: "paid", count: 18 },
      { state: "processing", count: 22 },
      { state: "shipped", count: 31 },
      { state: "delivered", count: 57 }
    ],
    serviceStatus: {
      d1: "ok",
      dummyjson: "cached",
      stripe: c.env.STRIPE_SECRET_KEY ? "configured" : "sandbox_placeholder",
      resend: c.env.RESEND_API_KEY ? "configured" : "not_configured"
    }
  });
});

const productListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  visibility: z.enum(["draft", "visible", "hidden"]).optional(),
  category: z.string().max(60).optional(),
  stock: z.enum(["low", "out"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["name", "price", "stock", "updated_at"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional()
});

// Admin list is a separate D1-backed path from the public catalog (real
// filters/sort/pagination pushed to SQL, includes draft/hidden rows) - see
// listProductsForAdmin in services/products-admin.ts for why.
adminRoutes.get(
  "/products",
  requirePermission("products.read"),
  zValidator("query", productListQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const result = await listProductsForAdmin(c.env, {
      search: query.search,
      visibility: query.visibility,
      category: query.category,
      stockFilter: query.stock,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      sortDirection: query.sortDirection
    });
    return ok(c, result);
  }
);

adminRoutes.get("/products/:id", requirePermission("products.read"), async (c) => {
  const row = await getProductRow(c.env, c.req.param("id"));
  if (!row) return fail(c, 404, "PRODUCT_NOT_FOUND", "Product not found.");
  const details = JSON.parse(row.details_json) as unknown;
  return ok(c, { ...row, details });
});

adminRoutes.post(
  "/products",
  requirePermission("products.write"),
  zValidator("json", productWriteSchemaValidated),
  async (c) => {
    const row = await createProduct(c.env, c.req.valid("json"));
    await writeAuditLog(c.env, {
      actorId: c.get("actor").userId ?? "admin",
      action: "product.created",
      targetType: "product",
      targetId: row.id,
      payload: { name: row.name, sku: row.sku }
    });
    return ok(c, row, 201);
  }
);

adminRoutes.patch(
  "/products/:id",
  requirePermission("products.write"),
  zValidator("json", productPatchSchema),
  async (c) => {
    const row = await updateProduct(c.env, c.req.param("id"), c.req.valid("json"));
    if (!row) return fail(c, 404, "PRODUCT_NOT_FOUND", "Product not found.");
    await writeAuditLog(c.env, {
      actorId: c.get("actor").userId ?? "admin",
      action: "product.updated",
      targetType: "product",
      targetId: row.id,
      payload: c.req.valid("json")
    });
    return ok(c, row);
  }
);

adminRoutes.post("/products/:id/publish", requirePermission("products.write"), async (c) => {
  const changed = await setProductVisibility(c.env, c.req.param("id"), "visible");
  if (!changed) return fail(c, 404, "PRODUCT_NOT_FOUND", "Product not found.");
  await writeAuditLog(c.env, {
    actorId: c.get("actor").userId ?? "admin",
    action: "product.visibility_changed",
    targetType: "product",
    targetId: c.req.param("id"),
    payload: { visibility: "visible" }
  });
  return ok(c, { id: c.req.param("id"), visibility: "visible" });
});

adminRoutes.post("/products/:id/archive", requirePermission("products.write"), async (c) => {
  const changed = await setProductVisibility(c.env, c.req.param("id"), "hidden");
  if (!changed) return fail(c, 404, "PRODUCT_NOT_FOUND", "Product not found.");
  await writeAuditLog(c.env, {
    actorId: c.get("actor").userId ?? "admin",
    action: "product.visibility_changed",
    targetType: "product",
    targetId: c.req.param("id"),
    payload: { visibility: "hidden" }
  });
  return ok(c, { id: c.req.param("id"), visibility: "hidden" });
});

adminRoutes.post(
  "/products/bulk",
  requirePermission("products.write"),
  zValidator(
    "json",
    z.object({
      ids: z.array(z.string().min(1)).min(1).max(200),
      action: z.enum(["publish", "archive", "draft"])
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const visibility = { publish: "visible", archive: "hidden", draft: "draft" }[body.action] as
      | "visible"
      | "hidden"
      | "draft";
    const changed = await bulkSetVisibility(c.env, body.ids, visibility);
    await writeAuditLog(c.env, {
      actorId: c.get("actor").userId ?? "admin",
      action: "product.bulk_visibility_changed",
      targetType: "product",
      targetId: null,
      payload: { ids: body.ids, visibility }
    });
    return ok(c, { changed, visibility });
  }
);

adminRoutes.delete("/products/:id", requirePermission("products.write"), async (c) => {
  const result = await deleteProduct(c.env, c.req.param("id"));
  await writeAuditLog(c.env, {
    actorId: c.get("actor").userId ?? "admin",
    action: "product.deleted",
    targetType: "product",
    targetId: c.req.param("id"),
    payload: result
  });
  return ok(c, result);
});

adminRoutes.post(
  "/products/:id/inventory-adjustment",
  requirePermission("inventory.write"),
  zValidator("json", z.object({ delta: z.number().int().refine((value) => value !== 0), reason: z.string().max(300).optional() })),
  async (c) => {
    const body = c.req.valid("json");
    const result = await adjustProductInventory(c.env, c.req.param("id"), {
      delta: body.delta,
      reason: body.reason,
      actorId: c.get("actor").userId ?? "admin",
      requestId: c.get("requestId")
    });
    if (!result) return fail(c, 404, "PRODUCT_NOT_FOUND", "Product not found.");
    return ok(c, result);
  }
);

adminRoutes.post("/products/:id/cache-refresh", requirePermission("products.write"), async (c) => {
  await clearCatalogCache(c.env);
  return ok(c, { productId: c.req.param("id"), refreshed: true });
});

adminRoutes.post("/uploads/signature", requirePermission("products.write"), async (c) => {
  const signature = await createUploadSignature(c.env);
  if (!signature) return fail(c, 503, "CLOUDINARY_NOT_CONFIGURED", "Image uploads are not configured.");
  return ok(c, signature);
});

// GET /inventory (the raw, SKU-keyed `inventory` table) and
// POST /inventory/adjustments (which only ever logged a movement row,
// never actually moved products.stock or validated the product existed)
// were removed here - products.stock is the single source of truth for
// stock, and POST /products/:id/inventory-adjustment (adjustProductInventory)
// is the one real, UI-wired way to adjust it.
adminRoutes.get(
  "/inventory/movements",
  requirePermission("inventory.read"),
  zValidator("query", z.object({ productId: z.string().optional() })),
  async (c) => {
    const productId = c.req.valid("query").productId;
    const rows = productId
      ? await c.env.DB.prepare("select * from inventory_movements where product_id = ? order by created_at desc limit 100")
          .bind(productId)
          .all<Record<string, unknown>>()
      : await c.env.DB.prepare("select * from inventory_movements order by created_at desc limit 100").all<Record<string, unknown>>();
    return ok(c, rows.results);
  }
);

const orderListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  channel: z.enum(["stripe", "wompi", "whatsapp"]).optional(),
  paymentStatus: z.enum(["pending", "paid", "failed", "refunded", "partially_refunded"]).optional(),
  fulfillmentStatus: z.enum(["unfulfilled", "processing", "shipped", "delivered", "cancelled"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

adminRoutes.get(
  "/orders",
  requirePermission("orders.read"),
  zValidator("query", orderListQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const where: string[] = [];
    const params: unknown[] = [];

    if (query.search) {
      where.push("(number like ? or email like ?)");
      const needle = `%${query.search}%`;
      params.push(needle, needle);
    }
    if (query.channel) {
      where.push("channel = ?");
      params.push(query.channel);
    }
    if (query.paymentStatus) {
      where.push("payment_status = ?");
      params.push(query.paymentStatus);
    }
    if (query.fulfillmentStatus) {
      where.push("fulfillment_status = ?");
      params.push(query.fulfillmentStatus);
    }

    const whereClause = where.length > 0 ? `where ${where.join(" and ")}` : "";
    const total = await c.env.DB.prepare(`select count(*) as count from orders ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();
    const offset = (query.page - 1) * query.pageSize;
    const rows = await c.env.DB.prepare(
      `select id, number, email, state, channel, payment_status, fulfillment_status, total, currency, created_at
       from orders ${whereClause} order by created_at desc limit ? offset ?`
    )
      .bind(...params, query.pageSize, offset)
      .all();

    const totalCount = total?.count ?? 0;
    return ok(c, {
      data: rows.results,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: totalCount,
        pageCount: Math.max(1, Math.ceil(totalCount / query.pageSize))
      }
    });
  }
);

adminRoutes.get("/orders/:id", requirePermission("orders.read"), async (c) => {
  const row = await c.env.DB.prepare(
    "select payload_json, channel, payment_status, fulfillment_status, internal_notes, tracking_carrier, tracking_number, tracking_url from orders where id = ?"
  )
    .bind(c.req.param("id"))
    .first<{
      payload_json: string;
      channel: string;
      payment_status: string;
      fulfillment_status: string;
      internal_notes: string | null;
      tracking_carrier: string | null;
      tracking_number: string | null;
      tracking_url: string | null;
    }>();
  if (!row) return fail(c, 404, "ORDER_NOT_FOUND", "Order not found.");

  // The columns (not the payload_json blob) are the source of truth for
  // these fields - orders created before migration 0015 have them
  // backfilled onto the columns but not into their already-stored JSON.
  const parsed = JSON.parse(row.payload_json) as Record<string, unknown>;
  const history = await c.env.DB.prepare(
    "select id, previous_state, new_state, actor_id, reason, created_at from order_status_history where order_id = ? order by created_at asc"
  )
    .bind(c.req.param("id"))
    .all();

  return ok(c, {
    ...parsed,
    channel: row.channel,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    internalNotes: row.internal_notes,
    tracking: row.tracking_carrier || row.tracking_number || row.tracking_url
      ? { carrier: row.tracking_carrier, number: row.tracking_number, url: row.tracking_url }
      : null,
    history: history.results
  });
});

adminRoutes.post(
  "/orders/manual",
  requirePermission("orders.write"),
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1) })).min(1),
      notes: z.string().max(2000).optional()
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const result = await createManualOrder(c.env, {
      email: body.email,
      items: body.items,
      notes: body.notes,
      actorId: c.get("actor").userId ?? "admin",
      requestId: c.get("requestId")
    });
    if ("error" in result) {
      const errorMap = {
        empty_items: ["EMPTY_ORDER", "An order needs at least one item."],
        product_not_found: ["PRODUCT_NOT_FOUND", "One of the products was not found."],
        insufficient_stock: ["INSUFFICIENT_STOCK", "Not enough stock for one of the items."]
      } as const;
      const [code, message] = errorMap[result.error];
      return fail(c, 422, code, message);
    }
    return ok(c, result.order, 201);
  }
);

adminRoutes.patch(
  "/orders/:id/fulfillment",
  requirePermission("orders.write"),
  zValidator("json", z.object({ fulfillmentStatus: z.enum(["unfulfilled", "processing", "shipped", "delivered", "cancelled"]) })),
  async (c) => {
    const orderId = c.req.param("id");
    const body = c.req.valid("json");
    const current = await c.env.DB.prepare("select fulfillment_status, stock_restored_at from orders where id = ?")
      .bind(orderId)
      .first<{ fulfillment_status: string; stock_restored_at: string | null }>();
    if (!current) return fail(c, 404, "ORDER_NOT_FOUND", "Order not found.");

    const from = current.fulfillment_status as Parameters<typeof canTransitionFulfillment>[0];
    if (!canTransitionFulfillment(from, body.fulfillmentStatus)) {
      return fail(c, 409, "FULFILLMENT_TRANSITION_INVALID", `Cannot transition ${from} to ${body.fulfillmentStatus}.`);
    }

    // Cancelling before it ships means the units never left - restore stock
    // the same way a full refund does, guarded by the same stock_restored_at
    // marker so an order that's both cancelled and later fully refunded
    // doesn't get double-restocked.
    const shouldRestock = body.fulfillmentStatus === "cancelled" && current.stock_restored_at === null;
    if (shouldRestock) {
      const restockStatements = await buildRestockStatements(c.env, orderId, {
        actorId: c.get("actor").userId ?? "admin",
        requestId: c.get("requestId"),
        reason: "fulfillment_cancelled"
      });
      const results = await c.env.DB.batch([
        c.env.DB.prepare(
          "update orders set fulfillment_status = ?, updated_at = ?, stock_restored_at = CURRENT_TIMESTAMP where id = ? and fulfillment_status = ?"
        ).bind(body.fulfillmentStatus, new Date().toISOString(), orderId, from),
        ...restockStatements
      ]);
      if ((results[0]?.meta.changes ?? 0) !== 1) {
        return fail(c, 409, "FULFILLMENT_CONFLICT", "The order changed while this update was being applied.");
      }
      await clearCatalogCache(c.env);
      return ok(c, { orderId, previousFulfillmentStatus: from, fulfillmentStatus: body.fulfillmentStatus });
    }

    const result = await c.env.DB.prepare(
      "update orders set fulfillment_status = ?, updated_at = ? where id = ? and fulfillment_status = ?"
    )
      .bind(body.fulfillmentStatus, new Date().toISOString(), orderId, from)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      return fail(c, 409, "FULFILLMENT_CONFLICT", "The order changed while this update was being applied.");
    }
    return ok(c, { orderId, previousFulfillmentStatus: from, fulfillmentStatus: body.fulfillmentStatus });
  }
);

adminRoutes.patch(
  "/orders/:id/payment",
  requirePermission("orders.write"),
  zValidator("json", z.object({ paymentStatus: z.enum(["pending", "paid", "failed", "refunded", "partially_refunded"]) })),
  async (c) => {
    const orderId = c.req.param("id");
    const body = c.req.valid("json");
    const current = await c.env.DB.prepare("select channel, payment_status from orders where id = ?")
      .bind(orderId)
      .first<{ channel: string; payment_status: string }>();
    if (!current) return fail(c, 404, "ORDER_NOT_FOUND", "Order not found.");

    // Stripe/Wompi orders' payment_status only moves through POST .../refund,
    // which calls the real provider API - this route would let someone mark
    // a provider order "refunded" without any money actually moving.
    // WhatsApp orders have no payment reference to reconcile against, so
    // the admin confirming payment by hand here is the intended flow.
    if (current.channel !== "whatsapp") {
      return fail(c, 409, "PAYMENT_STATUS_NOT_MANUAL", "Only WhatsApp orders can have their payment status set directly.");
    }

    const from = current.payment_status as Parameters<typeof canTransitionPayment>[0];
    if (!canTransitionPayment(from, body.paymentStatus)) {
      return fail(c, 409, "PAYMENT_TRANSITION_INVALID", `Cannot transition ${from} to ${body.paymentStatus}.`);
    }

    await c.env.DB.prepare("update orders set payment_status = ?, updated_at = ? where id = ?")
      .bind(body.paymentStatus, new Date().toISOString(), orderId)
      .run();
    return ok(c, { orderId, previousPaymentStatus: from, paymentStatus: body.paymentStatus });
  }
);

adminRoutes.patch(
  "/orders/:id/notes",
  requirePermission("orders.write"),
  zValidator("json", z.object({ notes: z.string().max(2000).nullable() })),
  async (c) => {
    await c.env.DB.prepare("update orders set internal_notes = ?, updated_at = ? where id = ?")
      .bind(c.req.valid("json").notes, new Date().toISOString(), c.req.param("id"))
      .run();
    return ok(c, { orderId: c.req.param("id"), notes: c.req.valid("json").notes });
  }
);

adminRoutes.patch(
  "/orders/:id/tracking",
  requirePermission("orders.write"),
  zValidator(
    "json",
    z.object({
      carrier: z.string().max(80).nullable(),
      number: z.string().max(80).nullable(),
      url: z.union([z.string().url(), z.null()])
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    await c.env.DB.prepare(
      "update orders set tracking_carrier = ?, tracking_number = ?, tracking_url = ?, updated_at = ? where id = ?"
    )
      .bind(body.carrier, body.number, body.url, new Date().toISOString(), c.req.param("id"))
      .run();
    return ok(c, { orderId: c.req.param("id"), tracking: body });
  }
);

adminRoutes.post("/orders/:id/refund", requirePermission("refunds.create"), zValidator("json", z.object({ amountCents: z.number().int().min(1).optional(), reason: z.string().max(300).optional() })), async (c) => {
  const orderId = c.req.param("id");
  const body = c.req.valid("json");
  const order = await c.env.DB.prepare(
    "select channel, payment_status, payload_json, total, stock_restored_at from orders where id = ?"
  )
    .bind(orderId)
    .first<{ channel: string; payment_status: string; payload_json: string; total: number; stock_restored_at: string | null }>();
  if (!order) return fail(c, 404, "ORDER_NOT_FOUND", "Order not found.");
  if (order.channel !== "stripe") {
    return fail(c, 409, "REFUND_NOT_APPLICABLE", "Only Stripe orders can be refunded through Stripe.");
  }
  if (order.payment_status !== "paid" && order.payment_status !== "partially_refunded") {
    return fail(c, 409, "REFUND_NOT_APPLICABLE", "Only a paid order can be refunded.");
  }

  const payload = JSON.parse(order.payload_json) as { payment?: { providerPaymentIntentId?: string } };
  const paymentIntentId = payload.payment?.providerPaymentIntentId;
  if (!paymentIntentId) {
    return fail(c, 422, "REFUND_MISSING_PAYMENT_INTENT", "This order has no Stripe payment intent to refund.");
  }

  try {
    const refund = await createRefund(c.env, paymentIntentId, body.amountCents);
    const nextStatus = body.amountCents && body.amountCents < order.total ? "partially_refunded" : "refunded";
    // Only a FULL refund restores stock - a partial refund is ambiguous
    // (could be a shipping/discount adjustment rather than returned goods),
    // and stock_restored_at guards against restocking twice if this order
    // was already restocked via a fulfillment cancellation.
    const shouldRestock = nextStatus === "refunded" && order.stock_restored_at === null;
    const restockStatements = shouldRestock
      ? await buildRestockStatements(c.env, orderId, {
          actorId: c.get("actor").userId ?? "admin",
          requestId: c.get("requestId"),
          reason: body.reason ?? `stripe_refund:${refund.id}`
        })
      : [];

    await c.env.DB.batch([
      c.env.DB.prepare(
        shouldRestock
          ? "update orders set payment_status = ?, updated_at = ?, stock_restored_at = CURRENT_TIMESTAMP where id = ?"
          : "update orders set payment_status = ?, updated_at = ? where id = ?"
      ).bind(nextStatus, new Date().toISOString(), orderId),
      c.env.DB.prepare(
        "update payments set status = ?, updated_at = CURRENT_TIMESTAMP where order_id = ?"
      ).bind(nextStatus === "refunded" ? "refunded" : "paid", orderId),
      // order_status_history's previous_state/new_state columns are plain
      // TEXT (no CHECK against orderStateSchema) - reused here for the
      // payment-status axis's own audit trail rather than adding a new
      // table, same table other admin order actions already write to.
      c.env.DB.prepare(
        `insert into order_status_history (id, order_id, previous_state, new_state, actor_id, reason, request_id)
         values (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        orderId,
        order.payment_status,
        nextStatus,
        c.get("actor").userId ?? "admin",
        body.reason ?? `stripe_refund:${refund.id}`,
        c.get("requestId")
      ),
      ...restockStatements
    ]);
    if (shouldRestock) {
      await clearCatalogCache(c.env);
    }
    await writeAuditLog(c.env, {
      actorId: c.get("actor").userId ?? "admin",
      action: "order.refunded",
      targetType: "order",
      targetId: orderId,
      payload: { paymentStatus: nextStatus, amountCents: body.amountCents ?? order.total, stripeRefundId: refund.id }
    });
    return ok(c, { orderId, paymentStatus: nextStatus, stripeRefundId: refund.id }, 201);
  } catch (error) {
    return fail(c, 500, "STRIPE_REFUND_FAILED", error instanceof Error ? error.message : "Stripe refund failed.");
  }
});

adminRoutes.patch(
  "/orders/:id/status",
  requirePermission("orders.write"),
  zValidator("json", z.object({ state: orderStateSchema, reason: z.string().trim().max(500).optional() })),
  async (c) => {
    const orderId = c.req.param("id");
    const body = c.req.valid("json");
    const current = await c.env.DB.prepare("select state, payload_json from orders where id = ?")
      .bind(orderId)
      .first<{ state: string; payload_json: string }>();

    if (!current) {
      return fail(c, 404, "ORDER_NOT_FOUND", "Order not found.");
    }

    const currentState = orderStateSchema.safeParse(current.state);
    if (!currentState.success) {
      return fail(c, 409, "ORDER_STATE_INVALID", "The stored order state is invalid.");
    }
    if (!canTransitionOrder(currentState.data, body.state)) {
      return fail(c, 409, "ORDER_TRANSITION_INVALID", `Cannot transition ${currentState.data} to ${body.state}.`);
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(current.payload_json) as Record<string, unknown>;
    } catch {
      return fail(c, 409, "ORDER_PAYLOAD_INVALID", "The stored order payload is invalid.");
    }

    const updatedAt = new Date().toISOString();
    const results = await c.env.DB.batch([
      c.env.DB.prepare(
        `insert into order_status_history (id, order_id, previous_state, new_state, actor_id, reason, request_id)
         select ?, id, state, ?, ?, ?, ? from orders where id = ? and state = ?`
      ).bind(
        crypto.randomUUID(),
        body.state,
        c.get("actor").userId ?? "admin",
        body.reason ?? null,
        c.get("requestId"),
        orderId,
        currentState.data
      ),
      c.env.DB.prepare(
        "update orders set state = ?, payload_json = ?, updated_at = CURRENT_TIMESTAMP where id = ? and state = ?"
      ).bind(body.state, JSON.stringify({ ...payload, state: body.state, updatedAt }), orderId, currentState.data)
    ]);

    if ((results[1]?.meta.changes ?? 0) !== 1) {
      return fail(c, 409, "ORDER_STATE_CONFLICT", "The order state changed while the update was being applied.");
    }

    return ok(c, { orderId, previousState: currentState.data, state: body.state, updatedAt });
  }
);

const customerListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

adminRoutes.get(
  "/users",
  requirePermission("users.read"),
  zValidator("query", customerListQuerySchema),
  async (c) => ok(c, await listCustomersForAdmin(c.env, c.req.valid("query")))
);

adminRoutes.get("/users/:id", requirePermission("users.read"), async (c) => {
  const detail = await getCustomerDetail(c.env, c.req.param("id"));
  return detail ? ok(c, detail) : fail(c, 404, "USER_NOT_FOUND", "Customer not found.");
});

adminRoutes.patch(
  "/users/:id/status",
  requirePermission("users.write"),
  zValidator("json", z.object({ status: z.enum(["active", "suspended"]) })),
  async (c) => {
    const targetId = c.req.param("id");
    if (c.get("actor").userId === targetId) {
      return fail(c, 400, "CANNOT_SUSPEND_SELF", "You cannot change your own account status.");
    }
    const { status } = c.req.valid("json");
    const result = await setCustomerStatus(c.env, targetId, status, {
      actorId: c.get("actor").userId ?? "admin",
      requestId: c.get("requestId")
    });
    if (!result.updated) {
      if (result.error === "not_found") return fail(c, 404, "USER_NOT_FOUND", "Customer not found.");
      return fail(c, 422, "GUEST_ACCOUNT", "This person has not created an account yet.");
    }
    return ok(c, { userId: targetId, status });
  }
);

// "guest" is excluded on purpose - it isn't a role anyone should ever be
// assigned from this panel, only granted implicitly to unauthenticated
// requests by auth.ts. Every other role, including super_admin, is
// assignable - the users.manage_roles permission gate above is what
// keeps this from being a privilege-escalation hole, not the role list.
const assignableRoleSchema = z.object({
  role: z.enum(["customer", "support", "catalog_manager", "order_manager", "admin", "super_admin", "demo_viewer"])
});

adminRoutes.patch(
  "/users/:id/role",
  requirePermission("users.manage_roles"),
  zValidator("json", assignableRoleSchema),
  async (c) => {
    const targetId = c.req.param("id");
    if (c.get("actor").userId === targetId) {
      return fail(c, 400, "CANNOT_CHANGE_OWN_ROLE", "You cannot change your own role.");
    }
    const { role } = c.req.valid("json");
    const result = await setCustomerRole(c.env, targetId, role, {
      actorId: c.get("actor").userId ?? "admin",
      requestId: c.get("requestId")
    });
    if (!result.updated) {
      if (result.error === "not_found") return fail(c, 404, "USER_NOT_FOUND", "Customer not found.");
      if (result.error === "guest_account") return fail(c, 422, "GUEST_ACCOUNT", "This person has not created an account yet.");
      return fail(c, 500, "CLERK_UPDATE_FAILED", "Could not update the role in Clerk.");
    }
    return ok(c, { userId: targetId, role });
  }
);

adminRoutes.get("/coupons", requirePermission("coupons.manage"), async (c) => ok(c, await createCouponService(c.env.DB).list()));
adminRoutes.post("/coupons", requirePermission("coupons.manage"), zValidator("json", z.object({ code: z.string(), type: z.string(), value: z.number().int() })), async (c) => {
  const body = c.req.valid("json");
  const code = body.code.toUpperCase();
  await c.env.DB.prepare("insert or replace into coupons (code, type, value, active, minimum_subtotal) values (?, ?, ?, 1, 0)")
    .bind(code, body.type, body.value)
    .run();
  await writeAuditLog(c.env, {
    actorId: c.get("actor").userId ?? "admin",
    action: "coupon.created",
    targetType: "coupon",
    targetId: code,
    payload: { type: body.type, value: body.value }
  });
  return ok(c, { code }, 201);
});
adminRoutes.patch(
  "/coupons/:id",
  requirePermission("coupons.manage"),
  zValidator(
    "json",
    z.object({
      type: z.string().optional(),
      value: z.number().int().optional(),
      active: z.boolean().optional(),
      minimumSubtotal: z.number().int().min(0).optional()
    })
  ),
  async (c) => {
    const code = c.req.param("id").toUpperCase();
    const existing = await c.env.DB.prepare("select * from coupons where code = ?")
      .bind(code)
      .first<{ type: string; value: number; active: number; minimum_subtotal: number }>();
    if (!existing) return fail(c, 404, "COUPON_NOT_FOUND", "Coupon not found.");
    const body = c.req.valid("json");
    await c.env.DB.prepare(
      `update coupons set type = ?, value = ?, active = ?, minimum_subtotal = ?, updated_at = CURRENT_TIMESTAMP where code = ?`
    )
      .bind(
        body.type ?? existing.type,
        body.value ?? existing.value,
        body.active !== undefined ? (body.active ? 1 : 0) : existing.active,
        body.minimumSubtotal ?? existing.minimum_subtotal,
        code
      )
      .run();
    await writeAuditLog(c.env, {
      actorId: c.get("actor").userId ?? "admin",
      action: "coupon.updated",
      targetType: "coupon",
      targetId: code,
      payload: body
    });
    return ok(c, { code, updated: true });
  }
);
adminRoutes.delete("/coupons/:id", requirePermission("coupons.manage"), async (c) => {
  const code = c.req.param("id").toUpperCase();
  await c.env.DB.prepare("update coupons set active = 0 where code = ?").bind(code).run();
  await writeAuditLog(c.env, {
    actorId: c.get("actor").userId ?? "admin",
    action: "coupon.deactivated",
    targetType: "coupon",
    targetId: code
  });
  return ok(c, { code, active: false });
});

adminRoutes.get("/reviews", requirePermission("reviews.moderate"), async (c) => ok(c, await createReviewModerationService(c.env.DB).list()));
adminRoutes.patch("/reviews/:id/moderation", requirePermission("reviews.moderate"), zValidator("json", z.object({ status: z.enum(["pending", "approved", "rejected", "hidden"]) })), async (c) => {
  return ok(c, await createReviewModerationService(c.env.DB).moderate(c.req.param("id"), c.req.valid("json").status));
});

adminRoutes.get("/contact-messages", requirePermission("contacts.read"), async (c) => {
  const rows = await c.env.DB.prepare(
    "select id, name, email, subject, message, locale, email_status, created_at from contact_messages order by created_at desc limit 100"
  ).all<Record<string, unknown>>();
  return ok(c, rows.results);
});

adminRoutes.post("/refunds", requirePermission("refunds.create"), (c) => ok(c, { simulated: true, provider: "stripe_sandbox" }, 201));

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  actorId: z.string().max(120).optional(),
  action: z.string().max(120).optional(),
  targetType: z.string().max(60).optional(),
  targetId: z.string().max(120).optional(),
  requestId: z.string().max(80).optional(),
  // Date-only (YYYY-MM-DD) - created_at is filtered via SQLite's date()
  // normalizer against a whole day, not a precise timestamp range.
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

// GET /admin/audit is intentionally read-only in every direction: there is
// no PATCH/DELETE for this table anywhere in the API, matching audit_logs'
// append-only contract at the application layer.
adminRoutes.get("/audit", requirePermission("audit.read"), zValidator("query", auditQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.actorId) {
    where.push("actor_id = ?");
    params.push(query.actorId);
  }
  if (query.action) {
    where.push("action = ?");
    params.push(query.action);
  }
  if (query.targetType) {
    where.push("target_type = ?");
    params.push(query.targetType);
  }
  if (query.targetId) {
    where.push("target_id = ?");
    params.push(query.targetId);
  }
  if (query.requestId) {
    where.push("request_id = ?");
    params.push(query.requestId);
  }
  if (query.from) {
    where.push("date(created_at) >= date(?)");
    params.push(query.from);
  }
  if (query.to) {
    where.push("date(created_at) <= date(?)");
    params.push(query.to);
  }

  const whereClause = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const total = await c.env.DB.prepare(`select count(*) as count from audit_logs ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();
  const offset = (query.page - 1) * query.pageSize;
  const rows = await c.env.DB.prepare(
    `select id, actor_id, actor_role, action, target_type, target_id, payload_json, previous_data, new_data, request_id, created_at
     from audit_logs ${whereClause} order by created_at desc limit ? offset ?`
  )
    .bind(...params, query.pageSize, offset)
    .all<Record<string, unknown>>();

  const totalCount = total?.count ?? 0;
  return collection(c, rows.results, {
    page: query.page,
    pageSize: query.pageSize,
    total: totalCount,
    pageCount: Math.max(1, Math.ceil(totalCount / query.pageSize))
  });
});

// Reuses audit.read rather than introducing a new permission - both are
// "an operator needs real visibility into what's happening", and adding a
// dedicated permission would mean touching packages/schemas' enum and
// every role's grant list for a single read-only admin page.
adminRoutes.get("/system-health", requirePermission("audit.read"), async (c) => ok(c, await computeSystemHealth(c.env)));
adminRoutes.get("/settings", requirePermission("settings.manage"), async (c) => ok(c, (await c.env.DB.prepare("select * from application_settings").all()).results));

async function saveApplicationSetting(c: Context<AppBindings>, key: string, value: unknown) {
  await c.env.DB.prepare(
    `insert into application_settings (key, value_json, updated_at)
     values (?, ?, CURRENT_TIMESTAMP)
     on conflict(key) do update set value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`
  )
    .bind(key, JSON.stringify(value))
    .run();
  await writeAuditLog(c.env, {
    actorId: c.get("actor").userId ?? "admin",
    action: "settings.updated",
    targetType: "settings",
    targetId: key,
    payload: value
  });
}

const checkoutSettingsSchema = z
  .object({
    paymentMode: z.enum(["stripe", "whatsapp"]),
    whatsappNumber: z.string().max(20),
    whatsappMessageTemplate: z.string().max(500).optional().default("")
  })
  .refine((value) => value.paymentMode !== "whatsapp" || isValidWhatsappNumber(value.whatsappNumber), {
    message: "whatsappNumber must be digits only with country code (e.g. 573001234567) when paymentMode is whatsapp",
    path: ["whatsappNumber"]
  });

// Scoped to this one key rather than a generic "patch any application_settings
// key" route - the table also holds shipping/brand/reservations, and a
// generic write endpoint would let settings.manage overwrite those with
// unvalidated payloads instead of each going through its own typed schema.
adminRoutes.patch(
  "/settings/checkout",
  requirePermission("settings.manage"),
  zValidator("json", checkoutSettingsSchema),
  async (c) => {
    const value = c.req.valid("json");
    await saveApplicationSetting(c, "checkout", value);
    return ok(c, value);
  }
);

// Provider-neutral checkout settings (which provider is active, and its
// encrypted secret material) - a different concern from settings/checkout
// above, which only toggles the storefront between Stripe and WhatsApp
// checkout. This is the admin-managed Stripe/Wompi credentials layer
// (see services/checkout-provider.ts and services/checkout-settings.ts).
adminRoutes.get("/checkout-settings", requirePermission("settings.manage"), async (c) =>
  ok(c, await summarizeCheckoutSettings(c.env))
);
adminRoutes.put(
  "/checkout-settings",
  requirePermission("settings.manage"),
  zValidator("json", checkoutSettingsUpdateSchema),
  async (c) => {
    if (!c.env.AETHER_SETTINGS_ENCRYPTION_KEY) {
      return fail(
        c,
        500,
        "SETTINGS_ENCRYPTION_NOT_CONFIGURED",
        "AETHER_SETTINGS_ENCRYPTION_KEY is not configured. Set it before storing checkout secrets from the admin panel."
      );
    }

    const input = c.req.valid("json");
    await createCheckoutSettingsService(c.env.DB, c.env.AETHER_SETTINGS_ENCRYPTION_KEY).update(sanitizeCheckoutSettingsUpdate(input));
    return ok(c, await summarizeCheckoutSettings(c.env));
  }
);

const brandSettingsSchema = z.object({
  name: z.string().min(1).max(60),
  tagline: z.object({ en: z.string().max(120), es: z.string().max(120) }),
  logoUrl: z.union([z.string().url(), z.literal("")]),
  primaryColor: z.string().refine(isValidHexColor, { message: "primaryColor must be a 6-digit hex color (e.g. #8b5cf6)" }),
  portfolioUrl: z.union([z.string().url(), z.literal("")]),
  features: z.object({ reviews: z.boolean() })
});

adminRoutes.patch(
  "/settings/brand",
  requirePermission("settings.manage"),
  zValidator("json", brandSettingsSchema),
  async (c) => {
    const value = c.req.valid("json");
    await saveApplicationSetting(c, "brand", value);
    return ok(c, value);
  }
);

// A single flat fee, on or off - not the tiered per-option/per-country model
// this used to be (freeShippingThreshold/countries/options), which the
// storefront never actually charged (see cart.ts's getShippingCents for
// where amountCents now really affects the cart total).
const shippingSettingsSchema = z.object({
  enabled: z.boolean(),
  amountCents: z.number().int().min(0)
});

adminRoutes.patch(
  "/settings/shipping",
  requirePermission("settings.manage"),
  zValidator("json", shippingSettingsSchema),
  async (c) => {
    const value = c.req.valid("json");
    await saveApplicationSetting(c, "shipping", value);
    return ok(c, value);
  }
);

const reservationSettingsSchema = z.object({ ttlMinutes: z.number().int().min(1).max(1440) });

adminRoutes.patch(
  "/settings/reservations",
  requirePermission("settings.manage"),
  zValidator("json", reservationSettingsSchema),
  async (c) => {
    const value = c.req.valid("json");
    await saveApplicationSetting(c, "reservations", value);
    return ok(c, value);
  }
);
function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Exported for characterization tests only - not part of the admin API surface.
export const __testables = { csvCell };

adminRoutes.get("/export/orders", requirePermission("exports.create"), async (c) => {
  const rows = await c.env.DB.prepare(
    "select id, number, email, state, channel, payment_status, fulfillment_status, total, currency, created_at from orders order by created_at desc limit 1000"
  ).all<{
    id: string;
    number: string;
    email: string;
    state: string;
    channel: string;
    payment_status: string;
    fulfillment_status: string;
    total: number;
    currency: string;
    created_at: string;
  }>();

  const header = ["id", "number", "email", "state", "channel", "payment_status", "fulfillment_status", "total", "currency", "created_at"];
  const lines = [header.join(",")];
  for (const row of rows.results || []) {
    lines.push(header.map((key) => csvCell(row[key as keyof typeof row])).join(","));
  }

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="orders-export.csv"`
    }
  });
});
