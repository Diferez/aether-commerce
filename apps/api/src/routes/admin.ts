import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { checkoutProviderIds } from "@aether/api-core";
import type { AppBindings } from "../types";
import { fail, ok } from "../http";
import { requirePermission } from "../middleware/admin";
import { clearCatalogCache, getCatalogProducts, getProductById } from "../services/catalog";
import { createInventoryService } from "../services/inventory";
import { createAdminOrderReadService, createOrderManagementService } from "../services/admin-orders";
import { createCouponService } from "../services/coupons";
import { createReviewModerationService } from "../services/review-moderation";
import { createProductOverrideService } from "../services/product-overrides";
import { createAdministrationService } from "../services/administration";
import { createCheckoutSettingsService } from "../services/checkout-settings";
import { summarizeCheckoutSettings } from "../services/checkout-provider";

const productOverrideSchema = z.object({
  name: z.string().min(1).optional(),
  visibility: z.enum(["visible", "hidden", "draft"]).optional(),
  flags: z.array(z.enum(["featured", "new", "deal", "limited", "hidden"])).optional()
});

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

adminRoutes.get("/products", requirePermission("products.read"), async (c) => {
  const result = await getCatalogProducts(c.env, { page: 1, pageSize: 50, sort: "featured" });
  return ok(c, result);
});

adminRoutes.get("/products/:id", requirePermission("products.read"), async (c) => ok(c, await getProductById(c.env, c.req.param("id"))));

adminRoutes.patch(
  "/products/:id/override",
  requirePermission("products.write"),
  zValidator("json", productOverrideSchema),
  async (c) => {
    return ok(c, await createProductOverrideService(c.env.DB).create(c.req.param("id"), c.req.valid("json")));
  }
);

adminRoutes.put(
  "/products/:id/override",
  requirePermission("products.write"),
  zValidator("json", productOverrideSchema),
  async (c) => {
    return ok(c, await createProductOverrideService(c.env.DB).save(c.req.param("id"), c.req.valid("json")));
  }
);

adminRoutes.delete("/products/:id/override", requirePermission("products.write"), async (c) => {
  return ok(c, await createProductOverrideService(c.env.DB).restore(c.req.param("id")));
});

adminRoutes.post("/products/:id/cache-refresh", requirePermission("products.write"), async (c) => {
  await clearCatalogCache(c.env);
  return ok(c, { productId: c.req.param("id"), refreshed: true });
});

adminRoutes.get("/inventory", requirePermission("inventory.read"), async (c) => {
  return ok(c, await createInventoryService(c.env.DB).listInventory());
});

adminRoutes.post(
  "/inventory/adjustments",
  requirePermission("inventory.write"),
  zValidator("json", z.object({ productId: z.string(), sku: z.string(), quantity: z.number().int(), reason: z.string().optional() })),
  async (c) => {
    const body = c.req.valid("json");
    await createInventoryService(c.env.DB).adjust({
      productId: body.productId,
      sku: body.sku,
      quantity: body.quantity,
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
      actorId: c.get("actor").userId ?? "system",
      requestId: c.get("requestId")
    });
    return ok(c, { adjusted: true }, 201);
  }
);

adminRoutes.get("/inventory/movements", requirePermission("inventory.read"), async (c) => {
  return ok(c, await createInventoryService(c.env.DB).listMovements());
});

adminRoutes.get("/orders", requirePermission("orders.read"), async (c) => {
  return ok(c, await createAdminOrderReadService(c.env.DB).listRecent());
});

adminRoutes.get("/orders/:id", requirePermission("orders.read"), async (c) => {
  return ok(c, await createAdminOrderReadService(c.env.DB).find(c.req.param("id")));
});

adminRoutes.patch(
  "/orders/:id/status",
  requirePermission("orders.write"),
  zValidator("json", z.object({ state: z.string(), reason: z.string().optional() })),
  async (c) => {
    const body = c.req.valid("json");
    await createOrderManagementService(c.env.DB).updateStatus({
      orderId: c.req.param("id"),
      state: body.state,
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
      actorId: c.get("actor").userId ?? "admin",
      requestId: c.get("requestId")
    });
    return ok(c, { orderId: c.req.param("id"), state: c.req.valid("json").state });
  }
);

adminRoutes.get("/users", requirePermission("users.read"), async (c) => ok(c, await createAdministrationService(c.env.DB).listUsers()));
adminRoutes.patch("/users/:id/status", requirePermission("users.read"), (c) => ok(c, { userId: c.req.param("id"), status: "local_status_updated" }));

adminRoutes.get("/coupons", requirePermission("coupons.manage"), async (c) => ok(c, await createCouponService(c.env.DB).list()));
adminRoutes.post("/coupons", requirePermission("coupons.manage"), zValidator("json", z.object({ code: z.string(), type: z.string(), value: z.number().int() })), async (c) => {
  return ok(c, await createCouponService(c.env.DB).create(c.req.valid("json")), 201);
});
adminRoutes.patch("/coupons/:id", requirePermission("coupons.manage"), (c) => ok(c, { code: c.req.param("id"), updated: true }));
adminRoutes.delete("/coupons/:id", requirePermission("coupons.manage"), async (c) => {
  await createCouponService(c.env.DB).deactivate(c.req.param("id"));
  return ok(c, { code: c.req.param("id"), active: false });
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
adminRoutes.get("/audit", requirePermission("audit.read"), async (c) => ok(c, await createAdministrationService(c.env.DB).listAuditLogs()));
adminRoutes.get("/settings", requirePermission("settings.manage"), async (c) => ok(c, await createAdministrationService(c.env.DB).listApplicationSettings()));
adminRoutes.patch("/settings", requirePermission("settings.manage"), (c) => ok(c, { updated: true }));

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
adminRoutes.get("/export/orders", requirePermission("exports.create"), (c) => ok(c, { format: "csv", simulated: true, rows: 0 }));
