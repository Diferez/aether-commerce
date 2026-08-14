import type { Cart, CartItem } from "@aether/schemas";
import type { Env } from "../types";
import { readCart } from "./cart";
import { getProductById } from "./catalog";

type StripeCheckoutSession = {
  id: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  customer_details?: {
    email?: string;
  };
  customer_email?: string;
  metadata?: {
    cartId?: string;
    userId?: string;
  };
  payment_intent?: string;
};

function orderNumber(sessionId: string) {
  const suffix = sessionId.replace(/^cs_(test|live)_/, "").slice(0, 10).toUpperCase();
  return `AETH-${suffix}`;
}

function demoShippingAddress(email: string) {
  return {
    fullName: email.split("@")[0] || "Aether Customer",
    line1: "Stripe sandbox checkout",
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
    .bind(JSON.stringify({ ...cart, items: [], totals: { ...cart.totals, subtotal: 0, discount: 0, tax: 0, total: 0 } }), cart.id)
    .run();
}

export async function createOrderFromStripeSession(env: Env, session: StripeCheckoutSession) {
  const existing = await readOrderBySession(env, session.id);
  if (existing) {
    return { order: JSON.parse(existing.payload_json) as Record<string, unknown>, created: false };
  }

  if (session.payment_status && session.payment_status !== "paid") {
    throw new Error("Stripe session is not paid");
  }

  const cartId = session.metadata?.cartId;
  if (!cartId) {
    throw new Error("Stripe session is missing cartId metadata");
  }

  const cart = await readCart(env, cartId);
  if (cart.items.length === 0) {
    throw new Error("Cart is empty or already cleared");
  }

  const email = session.customer_details?.email ?? session.customer_email ?? "customer@example.com";
  const now = new Date().toISOString();
  const total = session.amount_total ?? cart.totals.total;
  const currency = (session.currency ?? cart.totals.currency).toUpperCase();
  const order = {
    id: `ord_${session.id}`,
    number: orderNumber(session.id),
    userId: cart.userId ?? session.metadata?.userId,
    email,
    state: "paid",
    channel: "stripe",
    paymentStatus: "paid",
    fulfillmentStatus: "unfulfilled",
    items: cart.items,
    totals: { ...cart.totals, total, currency },
    shippingAddress: demoShippingAddress(email),
    payment: {
      provider: "stripe",
      providerSessionId: session.id,
      providerPaymentIntentId: session.payment_intent,
      status: "paid",
      amount: total,
      currency
    },
    internalNotes: null,
    tracking: null,
    createdAt: now,
    updatedAt: now
  };

  // channel/payment_status/fulfillment_status are additive columns
  // (migration 0015) - every other column and the idempotent
  // on-conflict-do-nothing insert are unchanged from before that migration.
  await env.DB.batch([
    env.DB.prepare(
      `insert into orders (id, number, user_id, email, state, channel, payment_status, fulfillment_status, payload_json, total, currency, created_at, updated_at)
       values (?, ?, ?, ?, 'paid', 'stripe', 'paid', 'unfulfilled', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       on conflict(id) do nothing`
    ).bind(order.id, order.number, order.userId ?? null, order.email, JSON.stringify(order), total, currency),
    env.DB.prepare(
      `insert into payments (id, order_id, provider, provider_ref, status, amount, currency, created_at, updated_at)
       values (?, ?, 'stripe', ?, 'paid', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(`pay_${session.id}`, order.id, session.payment_intent ?? session.id, total, currency),
    env.DB.prepare(
      `insert into order_status_history (id, order_id, previous_state, new_state, actor_id, reason, request_id)
       values (?, ?, null, 'paid', 'stripe', 'checkout.session.completed', ?)`
    ).bind(crypto.randomUUID(), order.id, session.id),
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

export type ManualOrderInput = {
  email: string;
  items: Array<{ productId: string; quantity: number }>;
  notes?: string | undefined;
  actorId: string;
  requestId: string;
};

export type ManualOrderError = "empty_items" | "product_not_found";

// WhatsApp orders have no automatic trigger - checkout.ts only opens a
// wa.me link with a message, nothing ever creates an order record for it.
// The admin creates one by hand after coordinating payment over chat.
// Items are looked up against the real catalog (getProductById) rather
// than accepting admin-typed name/price/image directly - keeps order line
// items grounded in real product data and the price the admin can't
// silently misstate.
export async function createManualOrder(
  env: Env,
  input: ManualOrderInput
): Promise<{ order: Record<string, unknown> } | { error: ManualOrderError }> {
  if (input.items.length === 0) {
    return { error: "empty_items" };
  }

  const items: CartItem[] = [];
  for (const line of input.items) {
    const product = await getProductById(env, line.productId);
    if (!product) {
      return { error: "product_not_found" };
    }
    const quantity = Math.max(1, Math.round(line.quantity));
    items.push({
      productId: product.id,
      quantity,
      name: product.name,
      slug: product.slug,
      imageUrl: product.thumbnail,
      unitPrice: product.finalPrice,
      finalUnitPrice: product.finalPrice,
      lineTotal: product.finalPrice * quantity,
      currency: "USD"
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const id = `ord_wa_${crypto.randomUUID()}`;
  const number = `AETH-WA-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();

  const order = {
    id,
    number,
    email: input.email,
    state: "pending_payment",
    channel: "whatsapp",
    paymentStatus: "pending",
    fulfillmentStatus: "unfulfilled",
    items,
    totals: { subtotal, discount: 0, shipping: 0, tax: 0, total: subtotal, currency: "USD" },
    shippingAddress: demoShippingAddress(input.email),
    internalNotes: input.notes ?? null,
    tracking: null,
    createdAt: now,
    updatedAt: now
  };

  await env.DB.batch([
    env.DB.prepare(
      `insert into orders (id, number, user_id, email, state, channel, payment_status, fulfillment_status, internal_notes, payload_json, total, currency, created_at, updated_at)
       values (?, ?, null, ?, 'pending_payment', 'whatsapp', 'pending', 'unfulfilled', ?, ?, ?, 'USD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(id, number, input.email, input.notes ?? null, JSON.stringify(order), subtotal),
    env.DB.prepare(
      `insert into order_status_history (id, order_id, previous_state, new_state, actor_id, reason, request_id)
       values (?, ?, null, 'pending_payment', ?, 'manual_whatsapp_order', ?)`
    ).bind(crypto.randomUUID(), id, input.actorId, input.requestId),
    ...items.map((item) =>
      env.DB.prepare(
        `insert into order_items (id, order_id, product_id, sku, payload_json, created_at)
         values (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      ).bind(crypto.randomUUID(), id, item.productId, item.productId, JSON.stringify(item))
    )
  ]);

  return { order };
}
