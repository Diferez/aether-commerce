import { Hono } from "hono";
import type { AppBindings } from "../types";
import { fail, ok } from "../http";
import { verifyStripeSignature } from "../services/stripe";
import { createOrderFromStripeSession } from "../services/orders";
import { createWebhookEventService } from "../services/webhook-events";
import { parseStripeWebhookPayload } from "@aether/api-core";

export const webhookRoutes = new Hono<AppBindings>();

webhookRoutes.post("/stripe", async (c) => {
  const body = await c.req.text();
  const signature = c.req.header("stripe-signature");

  if (!c.env.STRIPE_WEBHOOK_SECRET || !signature) {
    return fail(c, 401, "WEBHOOK_NOT_CONFIGURED", "Stripe webhook secret is not configured.");
  }

  const valid = await verifyStripeSignature(c.env.STRIPE_WEBHOOK_SECRET, body, signature);
  if (!valid) {
    return fail(c, 401, "INVALID_SIGNATURE", "Invalid Stripe webhook signature.");
  }

  const payload = parseStripeWebhookPayload(body);
  await createWebhookEventService(c.env.DB).record("stripe", payload.id, body);

  let orderCreated = false;
  if (payload.type === "checkout.session.completed" && payload.data?.object) {
    const result = await createOrderFromStripeSession(c.env, payload.data.object);
    orderCreated = result.created;
  }

  return ok(c, { received: true, type: payload.type, orderCreated });
});
