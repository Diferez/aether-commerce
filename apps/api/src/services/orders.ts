import { clearPaidCart, createPaidOrder, type CheckoutProviderId, type PaidCheckoutSession } from "@aether/api-core";
import type { Address, Cart } from "@aether/schemas";
import type { Env } from "../types";
import { readCart } from "./cart";

function demoShippingAddress(email: string): Address {
  return {
    fullName: email.split("@")[0] || "Aether Customer",
    line1: "Sandbox checkout",
    city: "Demo City",
    region: "Demo",
    postalCode: "00000",
    country: "US"
  };
}

async function readOrderBySession(env: Env, sessionId: string) {
  return env.DB.prepare("select payload_json from orders where id = ?")
    .bind(`ord_${sessionId}`)
    .first<{ payload_json: string }>();
}

async function markCartPaid(env: Env, cart: Cart) {
  await env.DB.prepare("update carts set payload_json = ?, updated_at = CURRENT_TIMESTAMP where id = ?")
    .bind(JSON.stringify(clearPaidCart(cart)), cart.id)
    .run();
}

export async function createOrderFromPaidSession(env: Env, session: PaidCheckoutSession, provider: CheckoutProviderId) {
  const existing = await readOrderBySession(env, session.id);
  if (existing) {
    return { order: JSON.parse(existing.payload_json) as Record<string, unknown>, created: false };
  }

  if (session.status !== "paid") {
    throw new Error(`${provider} session is not paid`);
  }

  const cartId = session.metadata?.cartId;
  if (!cartId) {
    throw new Error(`${provider} session is missing cartId metadata`);
  }

  const cart = await readCart(env, cartId);
  if (cart.items.length === 0) {
    throw new Error("Cart is empty or already cleared");
  }

  const email = session.customerEmail ?? "customer@example.com";
  const order = createPaidOrder({
    cart,
    payment: {
      id: session.id,
      email,
      ...(session.amountTotal !== undefined ? { amountTotal: session.amountTotal } : {}),
      ...(session.currency ? { currency: session.currency } : {}),
      ...(session.metadata?.userId ? { userId: session.metadata.userId } : {}),
      ...(session.providerReference ? { paymentIntentId: session.providerReference } : {})
    },
    paymentProvider: provider,
    orderNumberPrefix: "AETH",
    shippingAddress: demoShippingAddress(email)
  });
  const total = order.totals.total;
  const currency = order.totals.currency;

  await env.DB.batch([
    env.DB.prepare(
      `insert into orders (id, number, user_id, email, state, payload_json, total, currency, created_at, updated_at)
       values (?, ?, ?, ?, 'paid', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       on conflict(id) do nothing`
    ).bind(order.id, order.number, order.userId ?? null, order.email, JSON.stringify(order), total, currency),
    env.DB.prepare(
      `insert into payments (id, order_id, provider, provider_ref, status, amount, currency, created_at, updated_at)
       values (?, ?, ?, ?, 'paid', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(`pay_${session.id}`, order.id, provider, session.providerReference ?? session.id, total, currency),
    env.DB.prepare(
      `insert into order_status_history (id, order_id, previous_state, new_state, actor_id, reason, request_id)
       values (?, ?, null, 'paid', ?, 'checkout.session.completed', ?)`
    ).bind(crypto.randomUUID(), order.id, provider, session.id),
    ...cart.items.map((item) =>
      env.DB.prepare(
        `insert into order_items (id, order_id, product_id, sku, payload_json, created_at)
         values (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      ).bind(crypto.randomUUID(), order.id, item.productId, item.variantId ?? item.productId, JSON.stringify(item))
    )
  ]);

  await markCartPaid(env, cart);

  return { order, created: true };
}
