import { Hono } from "hono";
import type { AppBindings } from "../types";
import { fail, ok } from "../http";
import { verifyStripeSignature } from "../services/stripe";
import { createOrderFromStripeSession } from "../services/orders";
import { type ClerkUser, primaryEmailFromUser, verifyClerkSignature } from "../services/clerk";

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

  const payload = JSON.parse(body) as {
    id: string;
    type: string;
    data?: {
      object?: {
        id: string;
        payment_status?: string;
        amount_total?: number;
        currency?: string;
        customer_details?: { email?: string };
        customer_email?: string;
        metadata?: { cartId?: string; userId?: string };
        payment_intent?: string;
      };
    };
  };
  await c.env.DB.prepare(
    `insert into webhook_events
      (id, provider, provider_event_id, payload_json, processed_at, created_at, updated_at)
     values (?, 'stripe', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     on conflict(provider_event_id) do nothing`
  )
    .bind(crypto.randomUUID(), payload.id, body)
    .run();

  let orderCreated = false;
  if (payload.type === "checkout.session.completed" && payload.data?.object) {
    const result = await createOrderFromStripeSession(c.env, payload.data.object);
    orderCreated = result.created;
  }

  return ok(c, { received: true, type: payload.type, orderCreated });
});

webhookRoutes.post("/clerk", async (c) => {
  const body = await c.req.text();
  const svixId = c.req.header("svix-id");
  const svixTimestamp = c.req.header("svix-timestamp");
  const svixSignature = c.req.header("svix-signature");

  if (!c.env.CLERK_WEBHOOK_SECRET || !svixId || !svixTimestamp || !svixSignature) {
    return fail(c, 401, "WEBHOOK_NOT_CONFIGURED", "Clerk webhook secret is not configured.");
  }

  const valid = await verifyClerkSignature(c.env.CLERK_WEBHOOK_SECRET, body, { svixId, svixTimestamp, svixSignature });
  if (!valid) {
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
  const insert = await c.env.DB.prepare(
    `insert into webhook_events
      (id, provider, provider_event_id, payload_json, processed_at, created_at, updated_at)
     values (?, 'clerk', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     on conflict(provider_event_id) do nothing`
  )
    .bind(crypto.randomUUID(), svixId, body)
    .run();

  if ((insert.meta.changes ?? 0) === 0) {
    return ok(c, { received: true, type: payload.type, duplicate: true });
  }

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

  return ok(c, { received: true, type: payload.type });
});
