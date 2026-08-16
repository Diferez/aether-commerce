import type { Cart, CartItem } from "@aether/schemas";
import { OBSERVABILITY_EVENTS } from "@aether/core";
import type { Env } from "../types";
import { clearCatalogCache, getProductById } from "./catalog";
import { buildStockDecrementStatements, convertCartReservations, getAvailableStock } from "./inventory";
import { getLogger } from "./observability";
import { completeCheckoutSnapshotStatement, loadCheckoutSnapshot } from "./checkout-snapshots";

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
    checkoutSnapshotId?: string;
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

function clearCartIfUnchangedStatement(env: Env, cart: Cart, originalPayloadJson: string) {
  return env.DB.prepare(
    "update carts set payload_json = ?, updated_at = CURRENT_TIMESTAMP where id = ? and payload_json = ?"
  ).bind(
    JSON.stringify({ ...cart, items: [], totals: { ...cart.totals, subtotal: 0, discount: 0, tax: 0, total: 0 } }),
    cart.id,
    originalPayloadJson
  );
}

export async function createOrderFromStripeSession(env: Env, session: StripeCheckoutSession) {
  const existing = await readOrderBySession(env, session.id);
  if (existing) {
    return { order: JSON.parse(existing.payload_json) as Record<string, unknown>, created: false };
  }

  if (session.payment_status !== "paid") {
    throw new Error("Stripe session is not paid");
  }

  const cartId = session.metadata?.cartId;
  const snapshotId = session.metadata?.checkoutSnapshotId;
  if (!cartId || !snapshotId) {
    throw new Error("Stripe session is missing immutable checkout metadata");
  }

  const snapshot = await loadCheckoutSnapshot(env, snapshotId);
  if (!snapshot || snapshot.status !== "active") {
    throw new Error("Checkout snapshot is missing or no longer active");
  }
  if (Date.parse(snapshot.expiresAt) <= Date.now()) {
    throw new Error("Checkout snapshot has expired");
  }
  if (snapshot.providerSessionId && snapshot.providerSessionId !== session.id) {
    throw new Error("Checkout snapshot belongs to a different Stripe session");
  }
  if (snapshot.cartId !== cartId || snapshot.userId !== session.metadata?.userId) {
    throw new Error("Stripe checkout metadata does not match the immutable snapshot");
  }
  if (session.amount_total !== snapshot.amountTotal) {
    throw new Error("Stripe checkout amount does not match the immutable snapshot");
  }
  if (!session.currency || session.currency.toUpperCase() !== snapshot.currency) {
    throw new Error("Stripe checkout currency does not match the immutable snapshot");
  }

  const cart = snapshot.cart;
  if (cart.items.length === 0) {
    throw new Error("Checkout snapshot is empty");
  }

  const email = session.customer_details?.email ?? session.customer_email ?? "customer@example.com";
  const now = new Date().toISOString();
  const total = snapshot.amountTotal;
  const currency = snapshot.currency;
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

  // Resolve each cart item's real products.sku for the stock decrement below
  // (order_items.sku, bound further down, is historically the variant/product
  // id, not the real SKU - that convention predates this and stays as-is).
  // A product referenced by the cart can be missing here if it was deleted
  // between being added to the cart and this webhook firing (a product with
  // no order_items yet is still hard-deletable) - the Stripe payment has
  // already succeeded at this point, so a missing product only skips that
  // one line's stock/movement bookkeeping rather than failing order creation.
  const productIds = [...new Set(cart.items.map((item) => item.productId))];
  const skuRows = await env.DB.prepare(
    `select id, sku from products where id in (${productIds.map(() => "?").join(",")})`
  )
    .bind(...productIds)
    .all<{ id: string; sku: string }>();
  const skuByProductId = new Map(skuRows.results.map((row) => [row.id, row.sku]));

  const stockItems = cart.items
    .filter((item) => skuByProductId.has(item.productId))
    .map((item) => ({ productId: item.productId, sku: skuByProductId.get(item.productId)!, quantity: item.quantity }));
  const missingProductIds = cart.items
    .map((item) => item.productId)
    .filter((productId) => !skuByProductId.has(productId));
  if (missingProductIds.length > 0) {
    getLogger(env).error(OBSERVABILITY_EVENTS.orderUpdateFailed, {
      orderId: order.id,
      metadata: { reason: "deleted_product_referenced", missingProductIds }
    });
  }

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
    ),
    ...buildStockDecrementStatements(env, stockItems, { actorId: "stripe", requestId: session.id, reason: `order:${order.id}` }),
    convertCartReservations(env, cartId),
    completeCheckoutSnapshotStatement(env, snapshot.id, session.id),
    clearCartIfUnchangedStatement(env, cart, snapshot.cartPayloadJson)
  ]);

  await clearCatalogCache(env);

  return { order, created: true };
}

export type ManualOrderInput = {
  email: string;
  items: Array<{ productId: string; quantity: number }>;
  notes?: string | undefined;
  actorId: string;
  requestId: string;
};

export type ManualOrderError = "empty_items" | "product_not_found" | "insufficient_stock";

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
  const stockItems: Array<{ productId: string; sku: string; quantity: number }> = [];
  for (const line of input.items) {
    const product = await getProductById(env, line.productId);
    if (!product) {
      return { error: "product_not_found" };
    }
    const quantity = Math.max(1, Math.round(line.quantity));

    // No cart involved for a WhatsApp order, so check against stock net of
    // every active reservation across all carts - otherwise this could
    // double-book the same last unit an online shopper is mid-checkout on.
    const availability = await getAvailableStock(env, product.id);
    if (availability && quantity > availability.available) {
      return { error: "insufficient_stock" };
    }

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
    stockItems.push({ productId: product.id, sku: product.sku, quantity });
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
    ),
    ...buildStockDecrementStatements(env, stockItems, { actorId: input.actorId, requestId: input.requestId, reason: `order:${id}` })
  ]);

  await clearCatalogCache(env);

  return { order };
}
