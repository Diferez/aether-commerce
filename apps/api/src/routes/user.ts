import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { addressSchema, cartItemInputSchema, contactMessageSchema } from "@aether/schemas";
import type { AppBindings } from "../types";
import { collection, fail, ok } from "../http";
import { addItem, applyCoupon, readCart, updateItemQuantity, writeCart } from "../services/cart";
import { createCustomerPreferencesService } from "../services/customer-preferences";
import { createCustomerAddressService } from "../services/customer-addresses";
import { createCustomerOrderService } from "../services/customer-orders";
import { createCustomerReviewService } from "../services/customer-reviews";
import { createCustomerProfileService } from "../services/customer-profile";

const profileSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  locale: z.enum(["en", "es"]).optional()
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().min(3).max(120),
  body: z.string().min(10).max(1200)
});

// Every route below scopes data by this id, so it must only ever come from a
// verified Clerk session (set by the auth middleware from a validated JWT) -
// never from a client-supplied header, which would let any caller impersonate
// another user's id with no credentials at all.
function requireUserId(c: Context<AppBindings>): string | null {
  return c.get("actor").userId ?? null;
}

export const userRoutes = new Hono<AppBindings>();

userRoutes.get("/me", (c) => ok(c, c.get("actor")));

userRoutes.patch("/me", zValidator("json", profileSchema), async (c) => {
  const actor = c.get("actor");
  if (!actor.userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to update your profile.");
  return ok(c, await createCustomerProfileService(c.env.DB).update({
    userId: actor.userId,
    email: actor.email ?? "user@example.com",
    roles: actor.roles,
    ...c.req.valid("json")
  }));
});

userRoutes.get("/cart", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to view your cart.");
  return ok(c, await readCart(c.env, userId));
});

userRoutes.post("/cart/items", zValidator("json", cartItemInputSchema), async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to update your cart.");
  try {
    return ok(c, await addItem(c.env, userId, c.req.valid("json")), 201);
  } catch {
    return fail(c, 404, "PRODUCT_NOT_FOUND", "Product not found.");
  }
});

userRoutes.patch(
  "/cart/items/:id",
  zValidator("json", z.object({ quantity: z.number().int().min(1).max(25) })),
  async (c) => {
    const userId = requireUserId(c);
    if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to update your cart.");
    const itemId = c.req.param("id");
    const quantity = c.req.valid("json").quantity;
    return ok(c, await updateItemQuantity(c.env, userId, itemId, quantity));
  }
);

userRoutes.delete("/cart/items/:id", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to update your cart.");
  const cart = await readCart(c.env, userId);
  const itemId = c.req.param("id");
  return ok(c, await writeCart(c.env, { ...cart, items: cart.items.filter((item) => item.productId !== itemId && item.variantId !== itemId) }));
});

userRoutes.delete("/cart", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to update your cart.");
  return ok(c, await writeCart(c.env, { ...(await readCart(c.env, userId)), items: [] }));
});

userRoutes.post(
  "/cart/coupon",
  zValidator("json", z.object({ code: z.string().min(3).max(32) })),
  async (c) => {
    const userId = requireUserId(c);
    if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to update your cart.");
    return ok(c, await applyCoupon(c.env, userId, c.req.valid("json").code));
  }
);

userRoutes.get("/favorites", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to view your favorites.");
  return ok(c, await createCustomerPreferencesService(c.env.DB).listFavorites(userId));
});

userRoutes.post("/favorites/:productId", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to save favorites.");
  await createCustomerPreferencesService(c.env.DB).saveFavorite(userId, c.req.param("productId"));
  return ok(c, { productId: c.req.param("productId"), saved: true }, 201);
});

userRoutes.delete("/favorites/:productId", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to update your favorites.");
  await createCustomerPreferencesService(c.env.DB).removeFavorite(userId, c.req.param("productId"));
  return ok(c, { productId: c.req.param("productId"), saved: false });
});

userRoutes.get("/compare", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to view your comparison list.");
  return ok(c, await createCustomerPreferencesService(c.env.DB).readComparison(userId));
});

userRoutes.post("/compare/:productId", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to update your comparison list.");
  const next = await createCustomerPreferencesService(c.env.DB).addComparison(userId, c.req.param("productId"));
  return ok(c, next, 201);
});

userRoutes.delete("/compare/:productId", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to update your comparison list.");
  const next = await createCustomerPreferencesService(c.env.DB).removeComparison(userId, c.req.param("productId"));
  return ok(c, next);
});

userRoutes.get("/addresses", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to view your addresses.");
  const addresses = await createCustomerAddressService(c.env.DB).list(userId);
  return collection(c, addresses, {
    page: 1,
    pageSize: addresses.length,
    total: addresses.length,
    pageCount: addresses.length > 0 ? 1 : 0
  });
});

userRoutes.post("/addresses", zValidator("json", addressSchema), async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to save an address.");
  const address = await createCustomerAddressService(c.env.DB).create(userId, c.req.valid("json"));
  return ok(c, address, 201);
});

userRoutes.patch("/addresses/:id", zValidator("json", addressSchema.partial()), async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to update your address.");
  await createCustomerAddressService(c.env.DB).update(userId, c.req.param("id"), c.req.valid("json"));
  return ok(c, { id: c.req.param("id"), updated: true });
});

userRoutes.delete("/addresses/:id", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to update your address.");
  await createCustomerAddressService(c.env.DB).softDelete(userId, c.req.param("id"));
  return ok(c, { id: c.req.param("id"), deleted: true });
});

userRoutes.get("/orders", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to view your orders.");
  const orders = await createCustomerOrderService(c.env.DB).list(userId);
  return collection(c, orders, {
    page: 1,
    pageSize: orders.length,
    total: orders.length,
    pageCount: orders.length > 0 ? 1 : 0
  });
});

userRoutes.get("/orders/:id", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to view this order.");
  const order = await createCustomerOrderService(c.env.DB).find(userId, c.req.param("id"));
  return order ? ok(c, order) : fail(c, 404, "ORDER_NOT_FOUND", "Order not found.");
});

for (const action of ["cancel", "return", "refund-request"] as const) {
  userRoutes.post(`/orders/:id/${action}`, (c) => {
    const userId = requireUserId(c);
    if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to manage this order.");
    return ok(c, { orderId: c.req.param("id"), action, status: "requested" }, 201);
  });
}

userRoutes.post("/products/:id/reviews", zValidator("json", reviewSchema), async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to leave a review.");
  return ok(c, await createCustomerReviewService(c.env.DB).create(userId, c.req.param("id"), c.req.valid("json")), 201);
});

userRoutes.patch("/reviews/:id", zValidator("json", reviewSchema.partial()), async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to update your review.");
  await createCustomerReviewService(c.env.DB).update(userId, c.req.param("id"), c.req.valid("json"));
  return ok(c, { id: c.req.param("id"), updated: true });
});

userRoutes.delete("/reviews/:id", async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to update your review.");
  await createCustomerReviewService(c.env.DB).softDelete(userId, c.req.param("id"));
  return ok(c, { id: c.req.param("id"), deleted: true });
});

userRoutes.post("/contact-preview", zValidator("json", contactMessageSchema), (c) => ok(c, { accepted: true, message: c.req.valid("json") }));
