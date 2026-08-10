import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { AppBindings } from "../types";
import { fail, ok } from "../http";
import { readCart, writeCart } from "../services/cart";
import { resolveActorEmail } from "../services/clerk";
import { createCheckoutSession, retrieveCheckoutSession } from "../services/stripe";
import { createOrderFromStripeSession } from "../services/orders";

export const checkoutRoutes = new Hono<AppBindings>();

checkoutRoutes.post(
  "/session",
  zValidator("json", z.object({ cartId: z.string().min(1) })),
  async (c) => {
    const actor = c.get("actor");
    if (!actor.userId) {
      return fail(c, 401, "AUTH_REQUIRED", "Sign in before starting checkout.");
    }

    const cart = await readCart(c.env, c.req.valid("json").cartId);
    if (cart.items.length === 0) {
      return fail(c, 422, "EMPTY_CART", "Add at least one item before checkout.");
    }

    try {
      const checkoutCart = await writeCart(c.env, { ...cart, userId: actor.userId });
      const customerEmail = await resolveActorEmail(c.env, actor);
      return ok(c, await createCheckoutSession(c.env, checkoutCart, customerEmail), 201);
    } catch {
      return fail(
        c,
        500,
        "STRIPE_CHECKOUT_FAILED",
        "Stripe checkout could not be started. Check STRIPE_SECRET_KEY and network access."
      );
    }
  }
);

checkoutRoutes.post(
  "/confirm",
  zValidator("json", z.object({ sessionId: z.string().min(1) })),
  async (c) => {
    try {
      const session = await retrieveCheckoutSession(c.env, c.req.valid("json").sessionId);
      if (session.payment_status !== "paid") {
        return fail(c, 422, "PAYMENT_NOT_PAID", "Stripe checkout session is not paid yet.");
      }

      const result = await createOrderFromStripeSession(c.env, session);
      return ok(c, { order: result.order, created: result.created }, result.created ? 201 : 200);
    } catch (error) {
      return fail(
        c,
        500,
        "CHECKOUT_CONFIRM_FAILED",
        error instanceof Error ? error.message : "Checkout confirmation failed."
      );
    }
  }
);
