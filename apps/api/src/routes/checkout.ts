import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { isCheckoutSessionPaid } from "@aether/api-core";
import type { AppBindings } from "../types";
import { fail, ok } from "../http";
import { readCart } from "../services/cart";
import { createStripeCheckoutProvider } from "../services/stripe";
import { createOrderFromStripeSession } from "../services/orders";

export const checkoutRoutes = new Hono<AppBindings>();

checkoutRoutes.post(
  "/session",
  zValidator("json", z.object({ cartId: z.string().min(1) })),
  async (c) => {
    const cart = await readCart(c.env, c.req.valid("json").cartId);
    if (cart.items.length === 0) {
      return fail(c, 422, "EMPTY_CART", "Add at least one item before checkout.");
    }

    try {
      return ok(c, await createStripeCheckoutProvider(c.env).createCheckoutSession(cart), 201);
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
      const session = await createStripeCheckoutProvider(c.env).retrieveCheckoutSession(c.req.valid("json").sessionId);
      if (!isCheckoutSessionPaid(session)) {
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
