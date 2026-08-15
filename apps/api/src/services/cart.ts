import { calculateCartTotals } from "@aether/core";
import type { Cart, CartItem, CartItemInput, Coupon } from "@aether/schemas";
import type { Env } from "../types";
import { getProductBySlug, getCatalogProducts } from "./catalog";
import { InsufficientStockError, getAvailableStock, releaseReservation, upsertActiveReservation } from "./inventory";

const defaultCoupon: Coupon = {
  code: "AETHER10",
  type: "percentage",
  value: 10,
  active: true,
  minimumSubtotal: 20000
};

async function findProduct(env: Env, productId: string) {
  const bySlug = await getProductBySlug(env, productId);
  if (bySlug) return bySlug;
  const { data } = await getCatalogProducts(env, { page: 1, pageSize: 60, sort: "featured" });
  return data.find((product) => product.id === productId);
}

function emptyCart(id: string): Cart {
  return {
    id,
    items: [],
    totals: calculateCartTotals([]),
    updatedAt: new Date().toISOString()
  };
}

export async function createCart(env: Env, id = crypto.randomUUID()): Promise<Cart> {
  return writeCart(env, emptyCart(id));
}

export async function readCart(env: Env, id: string): Promise<Cart> {
  const row = await env.DB.prepare("select payload_json from carts where id = ?").bind(id).first<{
    payload_json: string;
  }>();

  if (!row) {
    return emptyCart(id);
  }

  return JSON.parse(row.payload_json) as Cart;
}

export async function writeCart(env: Env, cart: Cart): Promise<Cart> {
  const updated = { ...cart, updatedAt: new Date().toISOString() };
  await env.DB.prepare(
    `insert into carts (id, user_id, anonymous_id, payload_json, created_at, updated_at)
     values (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     on conflict(id) do update set
       user_id = excluded.user_id,
       anonymous_id = excluded.anonymous_id,
       payload_json = excluded.payload_json,
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind(updated.id, updated.userId ?? null, updated.anonymousId ?? null, JSON.stringify(updated))
    .run();
  return updated;
}

export async function addItem(env: Env, cartId: string, input: CartItemInput): Promise<Cart> {
  const product = await findProduct(env, input.productId);
  if (!product) {
    throw new Error("Product not found");
  }

  const variant = input.variantId
    ? product.variants.find((candidate) => candidate.id === input.variantId)
    : product.variants[0];
  const finalUnitPrice = product.finalPrice + (variant?.priceDelta ?? 0);
  const item: CartItem = {
    productId: product.id,
    variantId: variant?.id,
    quantity: input.quantity,
    name: product.name,
    slug: product.slug,
    imageUrl: product.images[0]?.url ?? "",
    unitPrice: product.price,
    finalUnitPrice,
    lineTotal: finalUnitPrice * input.quantity,
    currency: "USD"
  };

  const cart = await readCart(env, cartId);
  const existing = cart.items.find(
    (candidate) => candidate.productId === item.productId && candidate.variantId === item.variantId
  );
  const newQuantity = Math.min(25, (existing?.quantity ?? 0) + item.quantity);

  // Missing availability data (product row deleted out from under a cached
  // catalog entry) fails open rather than blocking the whole cart flow -
  // the real backstop against overselling is the atomic decrement at order
  // creation time, this check is a UX improvement on top of that, not the
  // only guard.
  const availability = await getAvailableStock(env, product.id, cartId);
  if (availability && newQuantity > availability.available) {
    throw new InsufficientStockError(availability.available);
  }

  const items = existing
    ? cart.items.map((candidate) =>
        candidate.productId === item.productId && candidate.variantId === item.variantId
          ? { ...candidate, quantity: newQuantity, lineTotal: candidate.finalUnitPrice * newQuantity }
          : candidate
      )
    : [...cart.items, item];

  const totals = calculateCartTotals(items, cart.couponCode === defaultCoupon.code ? defaultCoupon : undefined);
  const updatedCart = await writeCart(env, { ...cart, items, totals });
  await upsertActiveReservation(env, { cartId, productId: product.id, sku: product.sku, quantity: newQuantity });
  return updatedCart;
}

export async function applyCoupon(env: Env, cartId: string, code: string): Promise<Cart> {
  const cart = await readCart(env, cartId);
  const coupon = code.toUpperCase() === defaultCoupon.code ? defaultCoupon : undefined;
  const totals = calculateCartTotals(cart.items, coupon);
  return writeCart(env, { ...cart, couponCode: coupon?.code, totals });
}

export async function removeItem(env: Env, cartId: string, itemId: string): Promise<Cart> {
  const cart = await readCart(env, cartId);
  const removed = cart.items.find(
    (item) => item.productId === itemId || item.variantId === itemId || item.slug === itemId
  );
  const items = cart.items.filter(
    (item) => item.productId !== itemId && item.variantId !== itemId && item.slug !== itemId
  );
  const totals = calculateCartTotals(items, cart.couponCode === defaultCoupon.code ? defaultCoupon : undefined);
  const updatedCart = await writeCart(env, { ...cart, items, totals });
  if (removed) {
    await releaseReservation(env, cartId, removed.productId);
  }
  return updatedCart;
}

export async function updateItemQuantity(env: Env, cartId: string, itemId: string, quantity: number): Promise<Cart> {
  const cart = await readCart(env, cartId);
  const target = cart.items.find(
    (item) => item.productId === itemId || item.variantId === itemId || item.slug === itemId
  );

  if (target) {
    const availability = await getAvailableStock(env, target.productId, cartId);
    if (availability && quantity > availability.available) {
      throw new InsufficientStockError(availability.available);
    }
  }

  const items = cart.items.map((item) =>
    item.productId === itemId || item.variantId === itemId || item.slug === itemId
      ? { ...item, quantity, lineTotal: item.finalUnitPrice * quantity }
      : item
  );
  const totals = calculateCartTotals(items, cart.couponCode === defaultCoupon.code ? defaultCoupon : undefined);
  const updatedCart = await writeCart(env, { ...cart, items, totals });

  if (target) {
    const product = await findProduct(env, target.productId);
    if (product) {
      await upsertActiveReservation(env, { cartId, productId: target.productId, sku: product.sku, quantity });
    }
  }
  return updatedCart;
}
