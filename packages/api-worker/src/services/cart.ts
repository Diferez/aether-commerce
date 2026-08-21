import { createCartItem } from "@aether-commerce/api-core";
import { calculateCartTotals } from "@aether-commerce/core";
import type { Cart, CartItemInput, Coupon } from "@aether-commerce/schemas";
import type { Env } from "../types";
import { getProductBySlug, getCatalogProducts } from "./catalog";
import { InsufficientStockError, getAvailableStock, releaseReservation, upsertActiveReservation } from "./inventory";
import { createShippingSettingsService } from "./shipping-settings";
import { defaultShippingSettings } from "../defaults";
import { getRuntimeStoreConfig } from "./store-config";

// Reused by every cart-total recalculation below - the flat fee (see
// packages/core/src/shipping.ts's ShippingSettings) only ever affects the
// `shipping` slot calculateCartTotals already had; it's read fresh on every
// mutation (not cached) so a toggle in the admin panel takes effect on the
// operator's very next add/remove/quantity change, without the shopper
// having to start a new cart.
async function getShippingCents(env: Env): Promise<number> {
  const settings = await createShippingSettingsService(env.DB).get(defaultShippingSettings);
  return settings.enabled === true && typeof settings.amountCents === "number" ? settings.amountCents : 0;
}

export class InvalidCouponError extends Error {
  constructor() {
    super("That coupon code is not valid.");
    this.name = "InvalidCouponError";
  }
}

type CouponRow = {
  code: string;
  type: string;
  value: number;
  active: number;
  minimum_subtotal: number;
  starts_at: string | null;
  ends_at: string | null;
};

// Every coupon a shopper can actually redeem - AETHER10 is not special-cased
// code anymore, it's just the one row migration 0002_seed_demo.sql seeds
// into this same table (admin can deactivate it, or create/edit others from
// the Coupons admin page, and they take effect here immediately).
// Re-validates the cart's already-applied coupon (if any) on every item
// mutation, same reasoning as getShippingCents - if an admin deactivates a
// coupon mid-cart-life, the discount should disappear on the shopper's next
// add/remove/quantity change rather than sticking around until they touch
// the coupon field again.
async function resolveCartCoupon(env: Env, cart: Cart): Promise<Coupon | undefined> {
  return cart.couponCode ? findActiveCoupon(env, cart.couponCode) : undefined;
}

async function findActiveCoupon(env: Env, rawCode: string): Promise<Coupon | undefined> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return undefined;
  const row = await env.DB.prepare(
    "select code, type, value, active, minimum_subtotal, starts_at, ends_at from coupons where code = ?"
  )
    .bind(code)
    .first<CouponRow>();
  if (!row || !row.active || (row.type !== "percentage" && row.type !== "fixed")) return undefined;

  const now = Date.now();
  // D1 stores these as "YYYY-MM-DD HH:MM:SS" (CURRENT_TIMESTAMP's own
  // format, no "T"/"Z") when set that way, or a real ISO string when set
  // through the admin API - Date.parse handles the ISO form directly but
  // needs the same normalization used elsewhere in this codebase (e.g.
  // system-health.ts) for the space-separated one.
  const parse = (value: string) => Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (row.starts_at && parse(row.starts_at) > now) return undefined;
  if (row.ends_at && parse(row.ends_at) < now) return undefined;

  return {
    code: row.code,
    type: row.type,
    value: row.value,
    active: true,
    minimumSubtotal: row.minimum_subtotal
  };
}

async function findProduct(env: Env, productId: string) {
  const bySlug = await getProductBySlug(env, productId);
  if (bySlug) return bySlug;
  const { data } = await getCatalogProducts(env, { page: 1, pageSize: 60, sort: "featured" });
  return data.find((product) => product.id === productId);
}

function emptyCart(env: Env, id: string): Cart {
  return {
    id,
    items: [],
    totals: calculateCartTotals([], undefined, 0, 0, getRuntimeStoreConfig(env).currency),
    updatedAt: new Date().toISOString()
  };
}

export async function createCart(env: Env, id = crypto.randomUUID()): Promise<Cart> {
  return writeCart(env, emptyCart(env, id));
}

export async function readCart(env: Env, id: string): Promise<Cart> {
  const row = await env.DB.prepare("select payload_json from carts where id = ?").bind(id).first<{
    payload_json: string;
  }>();

  if (!row) {
    return emptyCart(env, id);
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

  const item = createCartItem(product, input);

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

  const [shipping, coupon] = await Promise.all([getShippingCents(env), resolveCartCoupon(env, cart)]);
  const totals = calculateCartTotals(items, coupon, shipping);
  const updatedCart = await writeCart(env, { ...cart, items, totals });
  await upsertActiveReservation(env, { cartId, productId: product.id, sku: product.sku, quantity: newQuantity });
  return updatedCart;
}

export async function applyCoupon(env: Env, cartId: string, code: string): Promise<Cart> {
  const coupon = await findActiveCoupon(env, code);
  if (!coupon) throw new InvalidCouponError();
  const cart = await readCart(env, cartId);
  const shipping = await getShippingCents(env);
  const totals = calculateCartTotals(cart.items, coupon, shipping);
  return writeCart(env, { ...cart, couponCode: coupon.code, totals });
}

export async function removeItem(env: Env, cartId: string, itemId: string): Promise<Cart> {
  const cart = await readCart(env, cartId);
  const removed = cart.items.find(
    (item) => item.productId === itemId || item.variantId === itemId || item.slug === itemId
  );
  const items = cart.items.filter(
    (item) => item.productId !== itemId && item.variantId !== itemId && item.slug !== itemId
  );
  const [shipping, coupon] = await Promise.all([getShippingCents(env), resolveCartCoupon(env, cart)]);
  const totals = calculateCartTotals(items, coupon, shipping);
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
  const [shipping, coupon] = await Promise.all([getShippingCents(env), resolveCartCoupon(env, cart)]);
  const totals = calculateCartTotals(items, coupon, shipping);
  const updatedCart = await writeCart(env, { ...cart, items, totals });

  if (target) {
    const product = await findProduct(env, target.productId);
    if (product) {
      await upsertActiveReservation(env, { cartId, productId: target.productId, sku: product.sku, quantity });
    }
  }
  return updatedCart;
}
