import { Hono } from "hono";
import type { AppBindings } from "../types";
import { ExternalServiceError, OBSERVABILITY_EVENTS } from "@aether-commerce/core";
import { parseStripeWebhookPayload, parseWompiWebhookPayload } from "@aether-commerce/api-core";
import { fail, ok } from "../http";
import { verifyStripeSignature, mapStripeSessionToPaidCheckoutSession } from "../services/stripe";
import { verifyWompiSignature, mapWompiTransactionToPaidCheckoutSession } from "../services/wompi";
import { createOrderFromPaidSession } from "../services/orders";
import { syncChargeRefunded, syncDisputeCreated } from "../services/payment-sync";
import { resolveCheckoutSettings } from "../services/checkout-provider";
import { type ClerkUser, primaryEmailFromUser, verifyClerkSignature } from "../services/clerk";
import { markWebhookFailed, markWebhookProcessing, markWebhookProcessed, recordWebhookReceived } from "../services/webhooks";
import { captureException, getLogger } from "../services/observability";
import { incrementMetric } from "../services/metrics";

export const webhookRoutes = new Hono<AppBindings>();

webhookRoutes.post("/stripe", async (c) => {
  const body = await c.req.text();
  const signature = c.req.header("stripe-signature");
  const requestId = c.get("requestId");
  const logger = getLogger(c.env);

  if (!signature) {
    return fail(c, 401, "WEBHOOK_NOT_CONFIGURED", "Stripe webhook secret is not configured.");
  }

  // Only resolved once a signature header is actually present - an
  // unauthenticated request with no signature at all shouldn't cost a D1
  // read just to look up the (possibly admin-configured) webhook secret.
  const settings = await resolveCheckoutSettings(c.env);
  const webhookSecret = settings.stripe.webhookSecret;
  if (!webhookSecret) {
    return fail(c, 401, "WEBHOOK_NOT_CONFIGURED", "Stripe webhook secret is not configured.");
  }

  const valid = await verifyStripeSignature(webhookSecret, body, signature);
  if (!valid) {
    logger.warn(OBSERVABILITY_EVENTS.securitySuspiciousActivity, { requestId, metadata: { reason: "invalid_stripe_signature" } });
    return fail(c, 401, "INVALID_SIGNATURE", "Invalid Stripe webhook signature.");
  }

  const payload = parseStripeWebhookPayload(body);

  const { shouldProcess } = await recordWebhookReceived(c.env, {
    provider: "stripe",
    eventId: payload.id,
    requestId,
    summary: { id: payload.id, type: payload.type, objectId: payload.data?.object?.id }
  });

  if (!shouldProcess) {
    logger.info(OBSERVABILITY_EVENTS.webhookDuplicate, { requestId, webhookEventId: payload.id, metadata: { provider: "stripe", type: payload.type } });
    return ok(c, { received: true, type: payload.type, duplicate: true });
  }

  logger.info(OBSERVABILITY_EVENTS.webhookReceived, { requestId, webhookEventId: payload.id, metadata: { provider: "stripe", type: payload.type } });
  await markWebhookProcessing(c.env, "stripe", payload.id);

  let orderCreated = false;
  try {
    if (payload.type === "checkout.session.completed" && payload.data?.object) {
      const session = mapStripeSessionToPaidCheckoutSession(payload.data.object);
      const result = await createOrderFromPaidSession(c.env, session, "stripe");
      orderCreated = result.created;
    } else if (payload.type === "charge.refunded" && payload.data?.object) {
      await syncChargeRefunded(c.env, payload.data.object, requestId);
    } else if (payload.type === "charge.dispute.created" && payload.data?.object) {
      await syncDisputeCreated(c.env, payload.data.object, requestId);
    }
    await markWebhookProcessed(c.env, "stripe", payload.id);
    logger.info(OBSERVABILITY_EVENTS.webhookProcessed, {
      requestId,
      webhookEventId: payload.id,
      metadata: { provider: "stripe", type: payload.type, orderCreated }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error processing webhook";
    await markWebhookFailed(c.env, "stripe", payload.id, { message });
    await incrementMetric(c.env, "webhooks_failed");
    logger.error(OBSERVABILITY_EVENTS.webhookFailed, {
      requestId,
      webhookEventId: payload.id,
      metadata: { provider: "stripe", type: payload.type },
      error
    });
    captureException(c.env, error, { requestId, route: "/api/v1/webhooks/stripe", method: "POST", code: "WEBHOOK_PROCESSING_FAILED" });
    // Throws (not a safe fail() response) so this returns a non-2xx and
    // Stripe's own retry schedule kicks in - swallowing it here would look
    // like success to Stripe and the event would never be retried.
    // reportable: false because captureException was already called above
    // with richer webhook-specific context - errorBoundary's own generic
    // reporting would otherwise send this same error to Sentry twice.
    throw new ExternalServiceError(message, { code: "WEBHOOK_PROCESSING_FAILED", reportable: false, cause: error });
  }

  return ok(c, { received: true, type: payload.type, orderCreated });
});

webhookRoutes.post("/wompi", async (c) => {
  const body = await c.req.text();
  const requestId = c.get("requestId");
  const logger = getLogger(c.env);
  const settings = await resolveCheckoutSettings(c.env);
  const eventsSecret = settings.wompi.webhookSecret;

  if (!eventsSecret) {
    return fail(c, 401, "WEBHOOK_NOT_CONFIGURED", "Wompi events secret is not configured.");
  }

  const payload = parseWompiWebhookPayload(body);
  const valid = await verifyWompiSignature(eventsSecret, payload);
  if (!valid) {
    logger.warn(OBSERVABILITY_EVENTS.securitySuspiciousActivity, { requestId, metadata: { reason: "invalid_wompi_signature" } });
    return fail(c, 401, "INVALID_SIGNATURE", "Invalid Wompi webhook signature.");
  }

  const transaction = payload.data?.transaction;
  const eventId = transaction?.id ?? payload.event;

  const { shouldProcess } = await recordWebhookReceived(c.env, {
    provider: "wompi",
    eventId,
    requestId,
    summary: { event: payload.event, transactionId: transaction?.id }
  });

  if (!shouldProcess) {
    logger.info(OBSERVABILITY_EVENTS.webhookDuplicate, { requestId, webhookEventId: eventId, metadata: { provider: "wompi", type: payload.event } });
    return ok(c, { received: true, type: payload.event, duplicate: true });
  }

  logger.info(OBSERVABILITY_EVENTS.webhookReceived, { requestId, webhookEventId: eventId, metadata: { provider: "wompi", type: payload.event } });
  await markWebhookProcessing(c.env, "wompi", eventId);

  let orderCreated = false;
  try {
    if (payload.event === "transaction.updated" && transaction) {
      const session = mapWompiTransactionToPaidCheckoutSession(transaction);
      const result = await createOrderFromPaidSession(c.env, session, "wompi");
      orderCreated = result.created;
    }
    await markWebhookProcessed(c.env, "wompi", eventId);
    logger.info(OBSERVABILITY_EVENTS.webhookProcessed, {
      requestId,
      webhookEventId: eventId,
      metadata: { provider: "wompi", type: payload.event, orderCreated }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error processing webhook";
    await markWebhookFailed(c.env, "wompi", eventId, { message });
    await incrementMetric(c.env, "webhooks_failed");
    logger.error(OBSERVABILITY_EVENTS.webhookFailed, {
      requestId,
      webhookEventId: eventId,
      metadata: { provider: "wompi", type: payload.event },
      error
    });
    captureException(c.env, error, { requestId, route: "/api/v1/webhooks/wompi", method: "POST", code: "WEBHOOK_PROCESSING_FAILED" });
    throw new ExternalServiceError(message, { code: "WEBHOOK_PROCESSING_FAILED", reportable: false, cause: error });
  }

  return ok(c, { received: true, type: payload.event, orderCreated });
});

webhookRoutes.post("/clerk", async (c) => {
  const body = await c.req.text();
  const svixId = c.req.header("svix-id");
  const svixTimestamp = c.req.header("svix-timestamp");
  const svixSignature = c.req.header("svix-signature");
  const requestId = c.get("requestId");
  const logger = getLogger(c.env);

  if (!c.env.CLERK_WEBHOOK_SECRET || !svixId || !svixTimestamp || !svixSignature) {
    return fail(c, 401, "WEBHOOK_NOT_CONFIGURED", "Clerk webhook secret is not configured.");
  }

  const valid = await verifyClerkSignature(c.env.CLERK_WEBHOOK_SECRET, body, { svixId, svixTimestamp, svixSignature });
  if (!valid) {
    logger.warn(OBSERVABILITY_EVENTS.securitySuspiciousActivity, { requestId, metadata: { reason: "invalid_clerk_signature" } });
    return fail(c, 401, "INVALID_SIGNATURE", "Invalid Clerk webhook signature.");
  }

  const payload = JSON.parse(body) as {
    type: string;
    data?: ClerkUser & {
      id?: string;
      first_name?: string | null;
      last_name?: string | null;
      public_metadata?: { roles?: string[] };
    };
  };

  // svix-id is the stable per-delivery event id Svix guarantees is unique -
  // same idempotency role payload.id plays for Stripe events above.
  const { shouldProcess } = await recordWebhookReceived(c.env, {
    provider: "clerk",
    eventId: svixId,
    requestId,
    summary: { type: payload.type, clerkUserId: payload.data?.id }
  });

  if (!shouldProcess) {
    logger.info(OBSERVABILITY_EVENTS.webhookDuplicate, { requestId, webhookEventId: svixId, metadata: { provider: "clerk", type: payload.type } });
    return ok(c, { received: true, type: payload.type, duplicate: true });
  }

  logger.info(OBSERVABILITY_EVENTS.webhookReceived, { requestId, webhookEventId: svixId, metadata: { provider: "clerk", type: payload.type } });
  await markWebhookProcessing(c.env, "clerk", svixId);

  try {
    const clerkUserId = payload.data?.id;
    if (payload.type === "user.deleted" && clerkUserId) {
      await c.env.DB.prepare("delete from users where clerk_id = ?").bind(clerkUserId).run();
    } else if ((payload.type === "user.created" || payload.type === "user.updated") && clerkUserId) {
      const email = primaryEmailFromUser(payload.data ?? {}) ?? "unknown@example.com";
      const name = [payload.data?.first_name, payload.data?.last_name].filter(Boolean).join(" ") || null;
      const incomingRoles = payload.data?.public_metadata?.roles;

      // Keep users.roles_json in sync when Clerk sends roles in the payload
      // (e.g. after an admin promotion round-trips through this webhook);
      // otherwise preserve whatever D1 already has rather than resetting a
      // known role back to the ["customer"] default on an unrelated profile edit.
      let rolesJson: string;
      if (incomingRoles && incomingRoles.length > 0) {
        rolesJson = JSON.stringify(incomingRoles);
      } else {
        const existing = await c.env.DB.prepare("select roles_json from users where id = ?")
          .bind(clerkUserId)
          .first<{ roles_json: string }>();
        rolesJson = existing?.roles_json ?? JSON.stringify(["customer"]);
      }

      await c.env.DB.prepare(
        `insert into users (id, clerk_id, email, name, roles_json, created_at, updated_at)
         values (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         on conflict(id) do update set email = excluded.email, name = excluded.name, roles_json = excluded.roles_json, updated_at = CURRENT_TIMESTAMP`
      )
        .bind(clerkUserId, clerkUserId, email, name, rolesJson)
        .run();
    }

    await markWebhookProcessed(c.env, "clerk", svixId);
    logger.info(OBSERVABILITY_EVENTS.webhookProcessed, { requestId, webhookEventId: svixId, metadata: { provider: "clerk", type: payload.type } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error processing webhook";
    await markWebhookFailed(c.env, "clerk", svixId, { message });
    await incrementMetric(c.env, "webhooks_failed");
    logger.error(OBSERVABILITY_EVENTS.webhookFailed, { requestId, webhookEventId: svixId, metadata: { provider: "clerk", type: payload.type }, error });
    captureException(c.env, error, { requestId, route: "/api/v1/webhooks/clerk", method: "POST", code: "WEBHOOK_PROCESSING_FAILED" });
    // reportable: false - already captured above with webhook-specific
    // context, avoiding a duplicate report from errorBoundary's own handling.
    throw new ExternalServiceError(message, { code: "WEBHOOK_PROCESSING_FAILED", reportable: false, cause: error });
  }

  return ok(c, { received: true, type: payload.type });
});
