import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { canTransitionOrder, isValidHexColor, isValidWhatsappNumber } from "@aether/core";
import { orderStateSchema } from "@aether/schemas";
import type { AppBindings } from "../types";
import { fail, ok } from "../http";
import { requirePermission } from "../middleware/admin";
import { clearCatalogCache } from "../services/catalog";
import { createUploadSignature } from "../services/cloudinary";
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

adminRoutes.get("/summary", requirePermission("orders.read"), (c) =>
  ok(c, {
    mode: "private",
    revenue: 1842500,
    orders: 128,
    conversionRate: 4.8,
    lowStock: 7
  })
);

adminRoutes.get("/dashboard", requirePermission("orders.read"), async (c) => {
  const lowStock = await c.env.DB.prepare("select count(*) as count from inventory where available <= low_stock_threshold").first<{
    count: number;
  }>();
  return ok(c, {
    revenue: 1842500,
    orders: 128,
    averageTicket: 14395,
    productsSold: 344,
    conversionRate: 4.8,
    lowStock: lowStock?.count ?? 7,
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
    return ok(c, row);
  }
);

adminRoutes.post("/products/:id/publish", requirePermission("products.write"), async (c) => {
  const changed = await setProductVisibility(c.env, c.req.param("id"), "visible");
  if (!changed) return fail(c, 404, "PRODUCT_NOT_FOUND", "Product not found.");
  return ok(c, { id: c.req.param("id"), visibility: "visible" });
});

adminRoutes.post("/products/:id/archive", requirePermission("products.write"), async (c) => {
  const changed = await setProductVisibility(c.env, c.req.param("id"), "hidden");
  if (!changed) return fail(c, 404, "PRODUCT_NOT_FOUND", "Product not found.");
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
    return ok(c, { changed, visibility });
  }
);

adminRoutes.delete("/products/:id", requirePermission("products.write"), async (c) => {
  const result = await deleteProduct(c.env, c.req.param("id"));
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

adminRoutes.get("/inventory", requirePermission("inventory.read"), async (c) => {
  const rows = await c.env.DB.prepare("select * from inventory order by updated_at desc limit 100").all<Record<string, unknown>>();
  return ok(c, rows.results);
});

adminRoutes.post(
  "/inventory/adjustments",
  requirePermission("inventory.write"),
  zValidator("json", z.object({ productId: z.string(), sku: z.string(), quantity: z.number().int(), reason: z.string().optional() })),
  async (c) => {
    const body = c.req.valid("json");
    await c.env.DB.prepare(
      "insert into inventory_movements (id, product_id, sku, type, quantity, reason, actor_id, request_id) values (?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        crypto.randomUUID(),
        body.productId,
        body.sku,
        body.quantity >= 0 ? "adjustment_positive" : "adjustment_negative",
        Math.abs(body.quantity),
        body.reason ?? null,
        c.get("actor").userId ?? "system",
        c.get("requestId")
      )
      .run();
    return ok(c, { adjusted: true }, 201);
  }
);

adminRoutes.get("/inventory/movements", requirePermission("inventory.read"), async (c) => {
  const rows = await c.env.DB.prepare("select * from inventory_movements order by created_at desc limit 100").all<Record<string, unknown>>();
  return ok(c, rows.results);
});

adminRoutes.get("/orders", requirePermission("orders.read"), async (c) => {
  const rows = await c.env.DB.prepare("select id, number, email, state, total, currency, created_at from orders order by created_at desc limit 100").all();
  return ok(c, rows.results);
});

adminRoutes.get("/orders/:id", requirePermission("orders.read"), async (c) => {
  const row = await c.env.DB.prepare("select payload_json from orders where id = ?").bind(c.req.param("id")).first<{ payload_json: string }>();
  return ok(c, row ? JSON.parse(row.payload_json) : null);
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

adminRoutes.get("/users", requirePermission("users.read"), async (c) => ok(c, (await c.env.DB.prepare("select id, name, roles_json, created_at from users limit 100").all()).results));
adminRoutes.patch("/users/:id/status", requirePermission("users.read"), (c) => ok(c, { userId: c.req.param("id"), status: "local_status_updated" }));

adminRoutes.get("/coupons", requirePermission("coupons.manage"), async (c) => ok(c, (await c.env.DB.prepare("select * from coupons").all()).results));
adminRoutes.post("/coupons", requirePermission("coupons.manage"), zValidator("json", z.object({ code: z.string(), type: z.string(), value: z.number().int() })), async (c) => {
  const body = c.req.valid("json");
  await c.env.DB.prepare("insert or replace into coupons (code, type, value, active, minimum_subtotal) values (?, ?, ?, 1, 0)")
    .bind(body.code.toUpperCase(), body.type, body.value)
    .run();
  return ok(c, { code: body.code.toUpperCase() }, 201);
});
adminRoutes.patch("/coupons/:id", requirePermission("coupons.manage"), (c) => ok(c, { code: c.req.param("id"), updated: true }));
adminRoutes.delete("/coupons/:id", requirePermission("coupons.manage"), async (c) => {
  await c.env.DB.prepare("update coupons set active = 0 where code = ?").bind(c.req.param("id").toUpperCase()).run();
  return ok(c, { code: c.req.param("id"), active: false });
});

adminRoutes.get("/reviews", requirePermission("reviews.moderate"), async (c) => ok(c, (await c.env.DB.prepare("select * from reviews order by created_at desc limit 100").all()).results));
adminRoutes.patch("/reviews/:id/moderation", requirePermission("reviews.moderate"), zValidator("json", z.object({ status: z.enum(["pending", "approved", "rejected", "hidden"]) })), async (c) => {
  await c.env.DB.prepare("update reviews set status = ?, updated_at = CURRENT_TIMESTAMP where id = ?")
    .bind(c.req.valid("json").status, c.req.param("id"))
    .run();
  return ok(c, { id: c.req.param("id"), status: c.req.valid("json").status });
});

adminRoutes.get("/contact-messages", requirePermission("contacts.read"), async (c) => {
  const rows = await c.env.DB.prepare(
    "select id, name, email, subject, message, locale, email_status, created_at from contact_messages order by created_at desc limit 100"
  ).all<Record<string, unknown>>();
  return ok(c, rows.results);
});

adminRoutes.post("/refunds", requirePermission("refunds.create"), (c) => ok(c, { simulated: true, provider: "stripe_sandbox" }, 201));
adminRoutes.get("/audit", requirePermission("audit.read"), async (c) => ok(c, (await c.env.DB.prepare("select * from audit_logs order by created_at desc limit 100").all()).results));
adminRoutes.get("/settings", requirePermission("settings.manage"), async (c) => ok(c, (await c.env.DB.prepare("select * from application_settings").all()).results));
adminRoutes.patch("/settings", requirePermission("settings.manage"), (c) => ok(c, { updated: true }));

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
    await c.env.DB.prepare(
      `insert into application_settings (key, value_json, updated_at)
       values ('checkout', ?, CURRENT_TIMESTAMP)
       on conflict(key) do update set value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`
    )
      .bind(JSON.stringify(value))
      .run();
    return ok(c, value);
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
    await c.env.DB.prepare(
      `insert into application_settings (key, value_json, updated_at)
       values ('brand', ?, CURRENT_TIMESTAMP)
       on conflict(key) do update set value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`
    )
      .bind(JSON.stringify(value))
      .run();
    return ok(c, value);
  }
);
adminRoutes.get("/export/orders", requirePermission("exports.create"), (c) => ok(c, { format: "csv", simulated: true, rows: 0 }));
