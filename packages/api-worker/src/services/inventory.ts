import { InventoryService, type InventoryRepository } from "@aether-commerce/api-core";
import { defaultReservationSettings } from "@aether-commerce/core";
import type { Env } from "../types";

/** D1 persistence adapter for reusable inventory operations. */
export function createInventoryService(db: D1Database): InventoryService {
  const repository: InventoryRepository = {
    async countLowStock() {
      const row = await db.prepare("select count(*) as count from inventory where available <= low_stock_threshold").first<{ count: number }>();
      return row?.count ?? 0;
    },
    async listInventory() {
      const rows = await db.prepare("select * from inventory order by updated_at desc limit 100").all<Record<string, unknown>>();
      return rows.results;
    },
    async listMovements() {
      const rows = await db.prepare("select * from inventory_movements order by created_at desc limit 100").all<Record<string, unknown>>();
      return rows.results;
    },
    async appendMovement(movement) {
      await db
        .prepare("insert into inventory_movements (id, product_id, sku, type, quantity, reason, actor_id, request_id) values (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(
          movement.id,
          movement.productId,
          movement.sku,
          movement.type,
          movement.quantity,
          movement.reason,
          movement.actorId,
          movement.requestId
        )
        .run();
    }
  };
  return new InventoryService(repository, () => crypto.randomUUID());
}

export const CHECKOUT_EXTENSION_MINUTES = 30;

export class InsufficientStockError extends Error {
  available: number;

  constructor(available: number) {
    super(`Only ${available} left in stock.`);
    this.name = "InsufficientStockError";
    this.available = available;
  }
}

function isoIn(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

// products.stock is the on-hand physical count; "available to sell" nets
// out active reservations from OTHER carts (this cart's own existing
// reservation for the product is about to be replaced by the caller, so it
// must not count against itself).
export async function getAvailableStock(env: Env, productId: string, excludeCartId?: string) {
  const product = await env.DB.prepare("select stock from products where id = ?")
    .bind(productId)
    .first<{ stock: number }>();
  if (!product) {
    return null;
  }

  const reserved = await env.DB.prepare(
    "select coalesce(sum(quantity), 0) as qty from inventory_reservations where product_id = ? and status = 'active' and (cart_id is null or cart_id != ?)"
  )
    .bind(productId, excludeCartId ?? "")
    .first<{ qty: number }>();

  const reservedByOthers = reserved?.qty ?? 0;
  return { stock: product.stock, reservedByOthers, available: Math.max(0, product.stock - reservedByOthers) };
}

// Reads the admin-configurable TTL (Settings page, apps/admin/app/settings/)
// with a fallback to defaultReservationSettings for the common case where
// nobody has ever saved an override - most deployments never touch this.
export async function getReservationTtlMinutes(env: Env): Promise<number> {
  const row = await env.DB.prepare("select value_json from application_settings where key = 'reservations'").first<{
    value_json: string;
  }>();
  if (!row) {
    return defaultReservationSettings.ttlMinutes;
  }
  try {
    const parsed = JSON.parse(row.value_json) as { ttlMinutes?: number };
    return typeof parsed.ttlMinutes === "number" && parsed.ttlMinutes > 0
      ? parsed.ttlMinutes
      : defaultReservationSettings.ttlMinutes;
  } catch {
    return defaultReservationSettings.ttlMinutes;
  }
}

// One active reservation row per (cart_id, product_id) - update in place
// when it already exists rather than inserting a second row, enforced for
// real by the partial unique index added in migration 0018.
export async function upsertActiveReservation(
  env: Env,
  input: { cartId: string; productId: string; sku: string; quantity: number }
): Promise<void> {
  const ttlMinutes = await getReservationTtlMinutes(env);
  const expiresAt = isoIn(ttlMinutes);
  const existing = await env.DB.prepare(
    "select id from inventory_reservations where cart_id = ? and product_id = ? and status = 'active'"
  )
    .bind(input.cartId, input.productId)
    .first<{ id: string }>();

  if (existing) {
    await env.DB.prepare(
      "update inventory_reservations set quantity = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP where id = ?"
    )
      .bind(input.quantity, expiresAt, existing.id)
      .run();
    return;
  }

  await env.DB.prepare(
    `insert into inventory_reservations (id, cart_id, product_id, sku, quantity, status, expires_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  )
    .bind(crypto.randomUUID(), input.cartId, input.productId, input.sku, input.quantity, expiresAt)
    .run();
}

export async function releaseReservation(env: Env, cartId: string, productId: string): Promise<void> {
  await env.DB.prepare(
    "update inventory_reservations set status = 'released', updated_at = CURRENT_TIMESTAMP where cart_id = ? and product_id = ? and status = 'active'"
  )
    .bind(cartId, productId)
    .run();
}

// Stripe's hosted checkout page defaults to a 24h session expiry, far
// longer than the cart's own 15-minute reservation TTL - without this, a
// shopper who takes a while entering payment details could lose their hold
// mid-checkout. Best-effort: a failed extension shouldn't block checkout.
export async function extendCartReservations(env: Env, cartId: string, minutes: number): Promise<void> {
  try {
    await env.DB.prepare(
      "update inventory_reservations set expires_at = ?, updated_at = CURRENT_TIMESTAMP where cart_id = ? and status = 'active'"
    )
      .bind(isoIn(minutes), cartId)
      .run();
  } catch {
    // A slow checkout losing its reservation extension is recoverable (the
    // shopper just re-adds to cart); it must not block the Stripe redirect.
  }
}

export function convertCartReservations(env: Env, cartId: string) {
  return env.DB.prepare(
    "update inventory_reservations set status = 'converted', updated_at = CURRENT_TIMESTAMP where cart_id = ? and status = 'active'"
  ).bind(cartId);
}

// SQL-level arithmetic (not adjustProductInventory's read-then-write
// pattern) - this has to live inside a batch() shared with order creation,
// where one statement can't feed its read result into another's bound
// params. max(0, ...) matches adjustProductInventory's own floor behavior.
// updated_at is bound as a real ISO string, not inline CURRENT_TIMESTAMP -
// products.updated_at flows through productSchema's strict .datetime() on
// every catalog read, and CURRENT_TIMESTAMP's "YYYY-MM-DD HH:MM:SS" shape
// fails that validation (same class of bug already fixed for expires_at).
export function buildStockDecrementStatements(
  env: Env,
  items: Array<{ productId: string; sku: string; quantity: number }>,
  actor: { actorId: string; requestId: string; reason?: string }
) {
  const now = new Date().toISOString();
  return items.flatMap((item) => [
    env.DB.prepare("update products set stock = max(0, stock - ?), updated_at = ? where id = ?").bind(
      item.quantity,
      now,
      item.productId
    ),
    env.DB.prepare(
      `insert into inventory_movements (id, product_id, sku, type, quantity, reason, actor_id, request_id)
       values (?, ?, ?, 'sale', ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), item.productId, item.sku, item.quantity, actor.reason ?? null, actor.actorId, actor.requestId)
  ]);
}

// Shared by a full refund and a fulfillment cancellation - both restore the
// same way, both gated by the caller checking orders.stock_restored_at first.
export async function buildRestockStatements(
  env: Env,
  orderId: string,
  actor: { actorId: string; requestId: string; reason: string }
) {
  const rows = await env.DB.prepare("select product_id, sku, payload_json from order_items where order_id = ?")
    .bind(orderId)
    .all<{ product_id: string; sku: string; payload_json: string }>();

  const now = new Date().toISOString();
  return rows.results.flatMap((row) => {
    const item = JSON.parse(row.payload_json) as { quantity?: number };
    const quantity = item.quantity ?? 0;
    if (quantity <= 0) {
      return [];
    }
    return [
      env.DB.prepare("update products set stock = stock + ?, updated_at = ? where id = ?").bind(
        quantity,
        now,
        row.product_id
      ),
      env.DB.prepare(
        `insert into inventory_movements (id, product_id, sku, type, quantity, reason, actor_id, request_id)
         values (?, ?, ?, 'return', ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), row.product_id, row.sku, quantity, actor.reason, actor.actorId, actor.requestId)
    ];
  });
}
