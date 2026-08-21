import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { addressSchema, cartItemInputSchema, contactMessageSchema } from "@aether/schemas";
import type { AppBindings } from "../types";
import { collection, fail, ok } from "../http";
import type { OrderState } from "@aether/schemas";
import { addItem, applyCoupon, InvalidCouponError, readCart, updateItemQuantity, writeCart } from "../services/cart";
import { createCustomerPreferencesService } from "../services/customer-preferences";
import { createCustomerAddressService } from "../services/customer-addresses";
import { createCustomerReviewService } from "../services/customer-reviews";
import { createCustomerProfileService } from "../services/customer-profile";
import { resolveActorEmail } from "../services/clerk";
import { readBrandSettings } from "../services/brand-settings";
import { changeOrderState, CURRENT_ORDER_SELECT, orderWithCurrentData, type StoredOrderRow } from "../services/orders";

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
    try {
      return ok(c, await applyCoupon(c.env, userId, c.req.valid("json").code));
    } catch (error) {
      if (error instanceof InvalidCouponError) {
        return fail(c, 404, "COUPON_NOT_FOUND", "That coupon code is not valid.");
      }
      throw error;
    }
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
  const actor = c.get("actor");
  const userId = actor.userId;
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to view your orders.");
  const email = await resolveActorEmail(c.env, actor);
  const rows = email
    ? await c.env.DB.prepare(
        `select ${CURRENT_ORDER_SELECT} from orders
         where user_id = ? or email = ? collate nocase
         order by created_at desc`
      )
        .bind(userId, email)
        .all<StoredOrderRow>()
    : await c.env.DB.prepare(`select ${CURRENT_ORDER_SELECT} from orders where user_id = ? order by created_at desc`)
        .bind(userId)
        .all<StoredOrderRow>();
  const orders = rows.results.map(orderWithCurrentData);
  return collection(c, orders, {
    page: 1,
    pageSize: orders.length,
    total: orders.length,
    pageCount: orders.length > 0 ? 1 : 0
  });
});

userRoutes.get("/orders/:id", async (c) => {
  const actor = c.get("actor");
  const userId = actor.userId;
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to view this order.");
  const email = await resolveActorEmail(c.env, actor);
  const row = email
    ? await c.env.DB.prepare(`select ${CURRENT_ORDER_SELECT} from orders where id = ? and (user_id = ? or email = ? collate nocase)`)
        .bind(c.req.param("id"), userId, email)
        .first<StoredOrderRow>()
    : await c.env.DB.prepare(`select ${CURRENT_ORDER_SELECT} from orders where id = ? and user_id = ?`)
        .bind(c.req.param("id"), userId)
        .first<StoredOrderRow>();
  return row ? ok(c, orderWithCurrentData(row)) : fail(c, 404, "ORDER_NOT_FOUND", "Order not found.");
});

// Maps each customer-facing action to the order-state machine's target state
// (packages/core/src/order-state.ts) - reuses the exact same transitions
// table and changeOrderState() helper the admin PATCH /orders/:id/status
// route uses, so a customer can never reach a state the admin panel itself
// couldn't also reach from the order's current state.
const orderActionTargetState: Record<"cancel" | "return" | "refund-request", OrderState> = {
  cancel: "cancelled",
  return: "return_requested",
  "refund-request": "refund_requested"
};

for (const action of ["cancel", "return", "refund-request"] as const) {
  userRoutes.post(`/orders/:id/${action}`, async (c) => {
    const actor = c.get("actor");
    const userId = actor.userId;
    if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to manage this order.");
    const orderId = c.req.param("id");

    const email = await resolveActorEmail(c.env, actor);
    const owned = email
      ? await c.env.DB.prepare("select 1 from orders where id = ? and (user_id = ? or email = ? collate nocase)")
          .bind(orderId, userId, email)
          .first()
      : await c.env.DB.prepare("select 1 from orders where id = ? and user_id = ?").bind(orderId, userId).first();
    if (!owned) return fail(c, 404, "ORDER_NOT_FOUND", "Order not found.");

    const result = await changeOrderState(c.env, orderId, orderActionTargetState[action], {
      actorId: userId,
      reason: `customer_${action.replace("-", "_")}`,
      requestId: c.get("requestId")
    });

    if (!result.ok) {
      switch (result.error) {
        case "not_found":
          return fail(c, 404, "ORDER_NOT_FOUND", "Order not found.");
        case "invalid_current_state":
          return fail(c, 409, "ORDER_STATE_INVALID", "The stored order state is invalid.");
        case "invalid_transition":
          return fail(
            c,
            409,
            "ORDER_TRANSITION_INVALID",
            `This order can't be ${action === "cancel" ? "cancelled" : action === "return" ? "returned" : "refunded"} from its current status.`
          );
        case "invalid_payload":
          return fail(c, 409, "ORDER_PAYLOAD_INVALID", "The stored order payload is invalid.");
        case "conflict":
          return fail(c, 409, "ORDER_STATE_CONFLICT", "The order status changed while the update was being applied.");
      }
    }

    return ok(c, { orderId, action, previousState: result.previousState, state: result.state, updatedAt: result.updatedAt }, 201);
  });
}

userRoutes.post("/products/:id/reviews", zValidator("json", reviewSchema), async (c) => {
  const userId = requireUserId(c);
  if (!userId) return fail(c, 401, "AUTH_REQUIRED", "Sign in to leave a review.");
  // Blocks new submissions into a queue nobody intends to moderate while the
  // storefront's own review UI is hidden (features.reviews off) - the admin
  // panel's toggle only controlled a display flag before this, never
  // actually stopped reviews from accumulating.
  const brand = await readBrandSettings(c.env);
  if (!brand.features.reviews) return fail(c, 403, "REVIEWS_DISABLED", "Reviews are currently disabled for this store.");
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
