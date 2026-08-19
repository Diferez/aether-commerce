import {
  createCartItem,
  createEmptyCart,
  withCartItem,
  withCartItemQuantity,
  withCoupon,
  withoutCartItem
} from "@aether/api-core";
import { calculateCartTotals } from "@aether/core";
import type { Cart, CartItemInput, Coupon } from "@aether/schemas";
import type { Env } from "../types";
import { getProductBySlug, getCatalogProducts } from "./catalog";

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
    return createEmptyCart(id);
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
  return writeCart(env, withCartItem(cart, item, cart.couponCode === defaultCoupon.code ? defaultCoupon : undefined));
}

export async function applyCoupon(env: Env, cartId: string, code: string): Promise<Cart> {
  const cart = await readCart(env, cartId);
  const coupon = code.toUpperCase() === defaultCoupon.code ? defaultCoupon : undefined;
  return writeCart(env, withCoupon(cart, coupon));
}

export async function removeItem(env: Env, cartId: string, itemId: string): Promise<Cart> {
  const cart = await readCart(env, cartId);
  return writeCart(env, withoutCartItem(cart, itemId, cart.couponCode === defaultCoupon.code ? defaultCoupon : undefined));
}

export async function updateItemQuantity(env: Env, cartId: string, itemId: string, quantity: number): Promise<Cart> {
  const cart = await readCart(env, cartId);
  return writeCart(env, withCartItemQuantity(cart, itemId, quantity, cart.couponCode === defaultCoupon.code ? defaultCoupon : undefined));
}
