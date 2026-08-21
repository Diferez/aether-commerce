import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { productQuerySchema } from "@aether-commerce/schemas";
import type { AppBindings } from "../types";
import { collection, fail, ok } from "../http";
import { getBrands, getCatalogProducts, getCategories, getCategoryCounts, getProductBySlug } from "../services/catalog";
import { subscribeToRestockNotification } from "../services/restock-notifications";

export const catalogRoutes = new Hono<AppBindings>();

function cachePublicCatalog(c: Context<AppBindings>) {
  c.header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
}

catalogRoutes.get("/products", zValidator("query", productQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const result = await getCatalogProducts(c.env, query);
  cachePublicCatalog(c);
  return collection(c, result.data, result.pagination);
});

catalogRoutes.get("/products/:slug", async (c) => {
  const product = await getProductBySlug(c.env, c.req.param("slug"));
  if (!product) {
    return fail(c, 404, "PRODUCT_NOT_FOUND", "Product not found.");
  }
  cachePublicCatalog(c);
  return ok(c, product);
});

catalogRoutes.post(
  "/products/:id/notify-restock",
  zValidator("json", z.object({ email: z.string().email() })),
  async (c) => {
    const result = await subscribeToRestockNotification(c.env, c.req.param("id"), c.req.valid("json").email);
    if (!result.ok) {
      return fail(c, 404, "PRODUCT_NOT_FOUND", "Product not found.");
    }
    return ok(c, { subscribed: true }, 201);
  }
);

catalogRoutes.get("/categories", async (c) => {
  cachePublicCatalog(c);
  return ok(c, await getCategories(c.env));
});

catalogRoutes.get("/categories/counts", async (c) => {
  cachePublicCatalog(c);
  return ok(c, await getCategoryCounts(c.env));
});

catalogRoutes.get("/brands", async (c) => {
  cachePublicCatalog(c);
  return ok(c, await getBrands(c.env));
});
