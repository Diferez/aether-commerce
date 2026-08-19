import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { productQuerySchema } from "@aether/schemas";
import { defaultBrandSettings, defaultCheckoutSettings } from "@aether/core";
import { aetherDemoShippingSettings } from "../config/aether-demo";
import type { AppBindings } from "../types";
import { collection, fail, ok } from "../http";
import { getBrands, getCatalogProducts, getCategories, getProductById, getProductBySlug } from "../services/catalog";
import { createPublicReviewService } from "../services/public-reviews";
import { createShippingSettingsService } from "../services/shipping-settings";

export const publicRoutes = new Hono<AppBindings>();

function cachePublicCatalog(c: Context<AppBindings>) {
  c.header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
}

export function clerkPublishableKey(issuer: string | undefined, secretKey: string | undefined) {
  if (!issuer) return null;

  const frontendApi = (() => {
    try {
      return new URL(issuer).host;
    } catch {
      return issuer.replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
  })();

  if (!frontendApi) return null;
  const prefix = secretKey?.startsWith("sk_live_") ? "pk_live" : "pk_test";
  return `${prefix}_${btoa(`${frontendApi}$`)}`;
}

publicRoutes.get("/runtime-config", (c) => {
  c.header("Cache-Control", "public, max-age=300, s-maxage=300");
  return ok(c, {
    clerkPublishableKey: clerkPublishableKey(c.env.CLERK_JWT_ISSUER, c.env.CLERK_SECRET_KEY)
  });
});

publicRoutes.get("/products", zValidator("query", productQuerySchema), async (c) => {
  const result = await getCatalogProducts(c.env, c.req.valid("query"));
  cachePublicCatalog(c);
  return collection(c, result.data, result.pagination);
});

publicRoutes.get("/products/:id", async (c) => {
  const product = await getProductById(c.env, c.req.param("id"));
  if (product) {
    cachePublicCatalog(c);
  }
  return product ? ok(c, product) : fail(c, 404, "PRODUCT_NOT_FOUND", "Product not found.");
});

publicRoutes.get("/products/slug/:slug", async (c) => {
  const product = await getProductBySlug(c.env, c.req.param("slug"));
  if (product) {
    cachePublicCatalog(c);
  }
  return product ? ok(c, product) : fail(c, 404, "PRODUCT_NOT_FOUND", "Product not found.");
});

publicRoutes.get("/categories", async (c) => {
  cachePublicCatalog(c);
  return ok(c, await getCategories(c.env));
});

publicRoutes.get("/brands", async (c) => {
  cachePublicCatalog(c);
  return ok(c, await getBrands(c.env));
});

publicRoutes.get("/categories/:slug/products", async (c) => {
  const result = await getCatalogProducts(c.env, {
    page: Number(c.req.query("page") ?? 1),
    pageSize: Number(c.req.query("limit") ?? 12),
    category: c.req.param("slug"),
    sort: "featured"
  });
  cachePublicCatalog(c);
  return collection(c, result.data, result.pagination);
});

publicRoutes.get("/search", async (c) => {
  const result = await getCatalogProducts(c.env, {
    page: Number(c.req.query("page") ?? 1),
    pageSize: Number(c.req.query("limit") ?? 12),
    search: c.req.query("q") ?? c.req.query("search") ?? "",
    sort: "featured"
  });
  cachePublicCatalog(c);
  return collection(c, result.data, result.pagination);
});

publicRoutes.get("/featured-products", async (c) => {
  const result = await getCatalogProducts(c.env, { page: 1, pageSize: 12, featured: true, sort: "featured" });
  cachePublicCatalog(c);
  return collection(c, result.data, result.pagination);
});

publicRoutes.get("/deals", async (c) => {
  const result = await getCatalogProducts(c.env, { page: 1, pageSize: 12, deal: true, sort: "discount" });
  cachePublicCatalog(c);
  return collection(c, result.data, result.pagination);
});

publicRoutes.get("/new-arrivals", async (c) => {
  const result = await getCatalogProducts(c.env, { page: 1, pageSize: 12, newArrival: true, sort: "newest" });
  cachePublicCatalog(c);
  return collection(c, result.data, result.pagination);
});

publicRoutes.get("/products/:id/reviews", async (c) => {
  const reviews = await createPublicReviewService(c.env.DB).listApproved(c.req.param("id"));
  const data = reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    status: review.status,
    created_at: review.createdAt
  }));
  return collection(c, data, {
    page: 1,
    pageSize: data.length,
    total: data.length,
    pageCount: data.length > 0 ? 1 : 0
  });
});

publicRoutes.get("/shipping/options", async (c) => {
  return ok(c, await createShippingSettingsService(c.env.DB).get(aetherDemoShippingSettings));
});

// wa.me links are public by nature (the number is visible in the URL once a
// shopper clicks it), so exposing it here unauthenticated carries no
// confidentiality risk - the storefront needs it to build the link
// client-side.
publicRoutes.get("/checkout/options", async (c) => {
  const row = await c.env.DB.prepare("select value_json from application_settings where key = 'checkout'").first<{
    value_json: string;
  }>();
  return ok(c, row ? JSON.parse(row.value_json) : defaultCheckoutSettings);
});

publicRoutes.get("/brand", async (c) => {
  const row = await c.env.DB.prepare("select value_json from application_settings where key = 'brand'").first<{
    value_json: string;
  }>();
  return ok(c, row ? JSON.parse(row.value_json) : defaultBrandSettings);
});
