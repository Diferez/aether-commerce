import { Hono } from "hono";
import type { AppBindings } from "../types";
import { fail, ok } from "../http";
import { verifyStripeSignature, mapStripeSessionToPaidCheckoutSession } from "../services/stripe";
import { verifyWompiSignature, mapWompiTransactionToPaidCheckoutSession } from "../services/wompi";
import { createOrderFromPaidSession } from "../services/orders";
import { createWebhookEventService } from "../services/webhook-events";
import { resolveCheckoutSettings } from "../services/checkout-provider";
import { parseStripeWebhookPayload, parseWompiWebhookPayload } from "@aether/api-core";

export const webhookRoutes = new Hono<AppBindings>();

webhookRoutes.post("/stripe", async (c) => {
  const body = await c.req.text();
  const signature = c.req.header("stripe-signature");
  const settings = await resolveCheckoutSettings(c.env);
  const webhookSecret = settings.stripe.webhookSecret;

  if (!webhookSecret || !signature) {
    return fail(c, 401, "WEBHOOK_NOT_CONFIGURED", "Stripe webhook secret is not configured.");
  }

  const valid = await verifyStripeSignature(webhookSecret, body, signature);
  if (!valid) {
    return fail(c, 401, "INVALID_SIGNATURE", "Invalid Stripe webhook signature.");
  }

  const payload = parseStripeWebhookPayload(body);
  await createWebhookEventService(c.env.DB).record("stripe", payload.id, body);

  let orderCreated = false;
  if (payload.type === "checkout.session.completed" && payload.data?.object) {
    const session = mapStripeSessionToPaidCheckoutSession(payload.data.object);
    const result = await createOrderFromPaidSession(c.env, session, "stripe");
    orderCreated = result.created;
  }

  return ok(c, { received: true, type: payload.type, orderCreated });
});

webhookRoutes.post("/wompi", async (c) => {
  const body = await c.req.text();
  const settings = await resolveCheckoutSettings(c.env);
  const eventsSecret = settings.wompi.webhookSecret;

  if (!eventsSecret) {
    return fail(c, 401, "WEBHOOK_NOT_CONFIGURED", "Wompi events secret is not configured.");
  }

  const payload = parseWompiWebhookPayload(body);
  const valid = await verifyWompiSignature(eventsSecret, payload);
  if (!valid) {
    return fail(c, 401, "INVALID_SIGNATURE", "Invalid Wompi webhook signature.");
  }

  const transaction = payload.data?.transaction;
  await createWebhookEventService(c.env.DB).record("wompi", transaction?.id ?? payload.event, body);

  let orderCreated = false;
  if (payload.event === "transaction.updated" && transaction) {
    const session = mapWompiTransactionToPaidCheckoutSession(transaction);
    const result = await createOrderFromPaidSession(c.env, session, "wompi");
    orderCreated = result.created;
  }

  return ok(c, { received: true, type: payload.event, orderCreated });
});
