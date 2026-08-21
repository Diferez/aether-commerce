import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { isCheckoutSessionPaid } from "@aether/api-core";
import { addressSchema } from "@aether/schemas";
import type { AppBindings } from "../types";
import { fail, ok } from "../http";
import { readCart, writeCart } from "../services/cart";
import { resolveActorEmail } from "../services/clerk";
import { resolveActiveCheckoutProvider } from "../services/checkout-provider";
import { createOrderFromPaidSession } from "../services/orders";
import { verifyCartToken } from "../services/cart-token";
import { CHECKOUT_EXTENSION_MINUTES, extendCartReservations } from "../services/inventory";
import { bindCheckoutSnapshotToSession, createCheckoutSnapshot } from "../services/checkout-snapshots";

export const checkoutRoutes = new Hono<AppBindings>();

// Relaxes addressSchema's postalCode (min 3) since Colombian storefront
// addresses commonly go without one, and fixes country server-side rather
// than asking the storefront's /checkout form for it - the checkout page
// only collects what the operator actually asked for (name, phone, address,
// city, department). Both gaps are filled in below before this rides along
// on the immutable checkout snapshot, so the value stored on the eventual
// order still satisfies the stricter schema addressSchema everywhere else
// expects.
const checkoutShippingAddressSchema = addressSchema.omit({ postalCode: true, country: true }).extend({
  postalCode: z.string().optional()
});

checkoutRoutes.post(
  "/session",
  zValidator("json", z.object({ cartId: z.string().min(1), shippingAddress: checkoutShippingAddressSchema.optional() })),
  async (c) => {
    const actor = c.get("actor");
    if (!actor.userId) {
      return fail(c, 401, "AUTH_REQUIRED", "Sign in before starting checkout.");
    }

    const { cartId, shippingAddress } = c.req.valid("json");
    const hasCartToken = await verifyCartToken(c.env, c.req.header("x-aether-cart-token"), cartId);
    if (!hasCartToken) {
      return fail(c, 401, "CART_TOKEN_REQUIRED", "A valid cart token is required.");
    }

    const cart = await readCart(c.env, cartId);
    if (cart.userId && cart.userId !== actor.userId) {
      return fail(c, 403, "CART_OWNERSHIP_MISMATCH", "This cart belongs to another account.");
    }
    if (cart.items.length === 0) {
      return fail(c, 422, "EMPTY_CART", "Add at least one item before checkout.");
    }

    const { mode, provider } = await resolveActiveCheckoutProvider(c.env);
    try {
      const checkoutCart = await writeCart(c.env, {
        ...cart,
        userId: actor.userId,
        ...(shippingAddress ? { shippingAddress: { ...shippingAddress, postalCode: shippingAddress.postalCode || "000000", country: "CO" } } : {})
      });
      await extendCartReservations(c.env, cartId, CHECKOUT_EXTENSION_MINUTES);
      const customerEmail = await resolveActorEmail(c.env, actor);
      // Every provider gets an immutable checkout snapshot
      // (services/checkout-snapshots.ts) - order creation only ever trusts
      // this snapshot, never the live (still-editable) cart, so a shopper
      // can't alter their cart after the price is quoted and before payment
      // clears. Stripe gets session.sessionId back immediately and binds it
      // here; Wompi's payment_links API has no such hook, so its adapter
      // instead threads the snapshot id through the reference field itself
      // (see wompiReference) and the webhook recovers it from there.
      const snapshot = await createCheckoutSnapshot(c.env, checkoutCart, actor.userId);
      const session = await provider.createCheckoutSession(checkoutCart, customerEmail, snapshot.id);
      if (session.sessionId) {
        await bindCheckoutSnapshotToSession(c.env, snapshot.id, session.sessionId);
      }
      return ok(c, { checkoutUrl: session.checkoutUrl }, 201);
    } catch {
      return fail(
        c,
        500,
        "CHECKOUT_SESSION_FAILED",
        `${mode} checkout could not be started. Check its secret key and network access.`
      );
    }
  }
);

checkoutRoutes.post(
  "/confirm",
  zValidator("json", z.object({ sessionId: z.string().min(1) })),
  async (c) => {
    const actor = c.get("actor");
    if (!actor.userId) {
      return fail(c, 401, "AUTH_REQUIRED", "Sign in before confirming checkout.");
    }

    const { mode, provider } = await resolveActiveCheckoutProvider(c.env);
    try {
      const session = await provider.retrieveCheckoutSession(c.req.valid("json").sessionId);
      if (!session.metadata?.userId || session.metadata.userId !== actor.userId) {
        return fail(c, 403, "CHECKOUT_OWNERSHIP_MISMATCH", "This checkout belongs to another account.");
      }
      if (!isCheckoutSessionPaid(session)) {
        return fail(c, 422, "PAYMENT_NOT_PAID", `${mode} checkout session is not paid yet.`);
      }

      const result = await createOrderFromPaidSession(c.env, session, mode);
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
