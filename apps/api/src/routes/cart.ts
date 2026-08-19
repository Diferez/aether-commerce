import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { cartItemInputSchema } from "@aether/schemas";
import type { AppBindings } from "../types";
import { fail, ok } from "../http";
import { createCartToken, verifyCartToken } from "../services/cart-token";
import { withIdempotency } from "../services/idempotency";
import { InsufficientStockError } from "../services/inventory";
import {
  addItem,
  applyCoupon,
  createCart,
  InvalidCouponError,
  readCart,
  removeItem,
  updateItemQuantity
} from "../services/cart";

export const cartRoutes = new Hono<AppBindings>();

async function purgeInactiveAnonymousCarts(c: Context<AppBindings>) {
  try {
    await c.env.DB.prepare(
      "delete from inventory_reservations where cart_id in (select id from carts where user_id is null and updated_at <= datetime('now', '-90 days'))"
    ).run();
    await c.env.DB.prepare(
      "delete from cart_items where cart_id in (select id from carts where user_id is null and updated_at <= datetime('now', '-90 days'))"
    ).run();
    await c.env.DB.prepare(
      "delete from carts where user_id is null and updated_at <= datetime('now', '-90 days')"
    ).run();
  } catch {
    // A cart session must remain available during rolling schema migrations.
  }
}

cartRoutes.post("/session", async (c) => {
  try {
    await purgeInactiveAnonymousCarts(c);
    const cartId = crypto.randomUUID();
    const token = await createCartToken(c.env, cartId);
    await createCart(c.env, cartId);
    return ok(c, { cartId, token }, 201);
  } catch {
    return fail(c, 500, "CART_TOKEN_UNAVAILABLE", "Cart token signing is not configured.");
  }
});

async function requireCartToken(c: Context<AppBindings>, cartId: string) {
  const valid = await verifyCartToken(c.env, c.req.header("x-aether-cart-token"), cartId);
  if (!valid) {
    return fail(c, 401, "CART_TOKEN_REQUIRED", "A valid cart token is required.");
  }
  return null;
}

cartRoutes.get("/:id", async (c) => {
  const tokenError = await requireCartToken(c, c.req.param("id"));
  if (tokenError) return tokenError;
  return ok(c, await readCart(c.env, c.req.param("id")));
});

cartRoutes.post("/:id/items", zValidator("json", cartItemInputSchema), async (c) => {
  const tokenError = await requireCartToken(c, c.req.param("id"));
  if (tokenError) return tokenError;

  return withIdempotency(
    c.env.DB,
    "POST /cart/:id/items",
    c.req.header("x-idempotency-key"),
    { cartId: c.req.param("id"), ...c.req.valid("json") },
    async () => {
      try {
        return ok(c, await addItem(c.env, c.req.param("id"), c.req.valid("json")), 201);
      } catch (error) {
        if (error instanceof InsufficientStockError) {
          return fail(c, 409, "INSUFFICIENT_STOCK", error.message, { available: error.available });
        }
        return fail(c, 404, "PRODUCT_NOT_FOUND", "Product not found.");
      }
    }
  );
});

cartRoutes.post(
  "/:id/coupon",
  zValidator("json", z.object({ code: z.string().min(3).max(32) })),
  async (c) => {
    const tokenError = await requireCartToken(c, c.req.param("id"));
    if (tokenError) return tokenError;
    try {
      return ok(c, await applyCoupon(c.env, c.req.param("id"), c.req.valid("json").code));
    } catch (error) {
      if (error instanceof InvalidCouponError) {
        return fail(c, 404, "COUPON_NOT_FOUND", "That coupon code is not valid.");
      }
      throw error;
    }
  }
);

cartRoutes.delete("/:id/items/:itemId", async (c) => {
  const tokenError = await requireCartToken(c, c.req.param("id"));
  if (tokenError) return tokenError;
  return withIdempotency(
    c.env.DB,
    "DELETE /cart/:id/items/:itemId",
    c.req.header("x-idempotency-key"),
    { cartId: c.req.param("id"), itemId: c.req.param("itemId") },
    async () =>
      ok(c, await removeItem(c.env, c.req.param("id"), decodeURIComponent(c.req.param("itemId"))))
  );
});

cartRoutes.patch(
  "/:id/items/:itemId",
  zValidator("json", z.object({ quantity: z.number().int().min(1).max(25) })),
  async (c) => {
    const tokenError = await requireCartToken(c, c.req.param("id"));
    if (tokenError) return tokenError;
    return withIdempotency(
      c.env.DB,
      "PATCH /cart/:id/items/:itemId",
      c.req.header("x-idempotency-key"),
      { cartId: c.req.param("id"), itemId: c.req.param("itemId"), ...c.req.valid("json") },
      async () => {
        try {
          return ok(
            c,
            await updateItemQuantity(
              c.env,
              c.req.param("id"),
              decodeURIComponent(c.req.param("itemId")),
              c.req.valid("json").quantity
            )
          );
        } catch (error) {
          if (error instanceof InsufficientStockError) {
            return fail(c, 409, "INSUFFICIENT_STOCK", error.message, { available: error.available });
          }
          throw error;
        }
      }
    );
  }
);
