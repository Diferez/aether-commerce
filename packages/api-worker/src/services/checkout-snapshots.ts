import type { Cart } from "@aether-commerce/schemas";
import type { Env } from "../types";

const CHECKOUT_SNAPSHOT_TTL_MINUTES = 60;

export type CheckoutSnapshot = {
  id: string;
  cartId: string;
  userId: string;
  cart: Cart;
  cartPayloadJson: string;
  amountTotal: number;
  currency: string;
  status: "active" | "completed" | "failed" | "expired";
  providerSessionId: string | null;
  expiresAt: string;
};

type CheckoutSnapshotRow = {
  id: string;
  cart_id: string;
  user_id: string;
  cart_payload_json: string;
  amount_total: number;
  currency: string;
  status: CheckoutSnapshot["status"];
  provider_session_id: string | null;
  expires_at: string;
};

export async function createCheckoutSnapshot(env: Env, cart: Cart, userId: string): Promise<CheckoutSnapshot> {
  const id = `chk_${crypto.randomUUID()}`;
  const cartPayloadJson = JSON.stringify(cart);
  const currency = cart.totals.currency.toUpperCase();
  const expiresAt = new Date(Date.now() + CHECKOUT_SNAPSHOT_TTL_MINUTES * 60_000).toISOString();

  await env.DB.prepare(
    `insert into checkout_snapshots
       (id, cart_id, user_id, cart_payload_json, amount_total, currency, status, expires_at)
     values (?, ?, ?, ?, ?, ?, 'active', ?)`
  )
    .bind(id, cart.id, userId, cartPayloadJson, cart.totals.total, currency, expiresAt)
    .run();

  return {
    id,
    cartId: cart.id,
    userId,
    cart,
    cartPayloadJson,
    amountTotal: cart.totals.total,
    currency,
    status: "active",
    providerSessionId: null,
    expiresAt
  };
}

export async function bindCheckoutSnapshotToSession(env: Env, snapshotId: string, sessionId: string): Promise<void> {
  const result = await env.DB.prepare(
    `update checkout_snapshots
     set provider_session_id = ?, updated_at = CURRENT_TIMESTAMP
     where id = ? and status = 'active' and (provider_session_id is null or provider_session_id = ?)`
  )
    .bind(sessionId, snapshotId, sessionId)
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error("Checkout snapshot could not be bound to the Stripe session");
  }
}

export async function loadCheckoutSnapshot(env: Env, snapshotId: string): Promise<CheckoutSnapshot | null> {
  const row = await env.DB.prepare(
    `select id, cart_id, user_id, cart_payload_json, amount_total, currency, status, provider_session_id, expires_at
     from checkout_snapshots where id = ?`
  )
    .bind(snapshotId)
    .first<CheckoutSnapshotRow>();
  if (!row) return null;
  return {
    id: row.id,
    cartId: row.cart_id,
    userId: row.user_id,
    cart: JSON.parse(row.cart_payload_json) as Cart,
    cartPayloadJson: row.cart_payload_json,
    amountTotal: row.amount_total,
    currency: row.currency.toUpperCase(),
    status: row.status,
    providerSessionId: row.provider_session_id,
    expiresAt: row.expires_at
  };
}

export function completeCheckoutSnapshotStatement(env: Env, snapshotId: string, sessionId: string) {
  return env.DB.prepare(
    `update checkout_snapshots
     set status = 'completed', provider_session_id = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     where id = ? and status = 'active' and (provider_session_id is null or provider_session_id = ?)`
  ).bind(sessionId, snapshotId, sessionId);
}

