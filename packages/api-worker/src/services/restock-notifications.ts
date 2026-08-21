import type { Env } from "../types";
import { sendRestockNotificationEmail } from "./email";

export type SubscribeRestockNotificationError = "product_not_found";

/** Subscribes an email to be notified once a product is back in stock. Idempotent - subscribing twice with the same email is a no-op, not an error. */
export async function subscribeToRestockNotification(
  env: Env,
  productId: string,
  email: string
): Promise<{ ok: true } | { ok: false; error: SubscribeRestockNotificationError }> {
  const product = await env.DB.prepare("select id from products where id = ?").bind(productId).first<{ id: string }>();
  if (!product) return { ok: false, error: "product_not_found" };

  await env.DB.prepare(
    `insert into restock_notifications (id, product_id, email, created_at)
     values (?, ?, ?, CURRENT_TIMESTAMP)
     on conflict(product_id, email) do nothing`
  )
    .bind(crypto.randomUUID(), productId, email)
    .run();

  return { ok: true };
}

type PendingNotificationRow = {
  id: string;
  email: string;
  product_id: string;
  name: string;
  slug: string;
};

/**
 * Emails every still-unnotified subscriber whose product now has stock,
 * then stamps notified_at so the same subscription is never emailed twice.
 * Called from the scheduled worker (apps/api/src/index.ts), not from any
 * request path - there is no "stock just changed" event to react to
 * (product updates go through several call sites), so this polls instead.
 */
export async function sendDueRestockNotifications(env: Env): Promise<{ sent: number }> {
  const rows = await env.DB.prepare(
    `select rn.id, rn.email, rn.product_id, p.name, p.slug
     from restock_notifications rn
     join products p on p.id = rn.product_id
     where rn.notified_at is null and p.stock > 0`
  ).all<PendingNotificationRow>();

  const origin = env.APP_ORIGIN_STORE ?? "http://localhost:3000";
  const basePath = env.APP_STORE_BASE_PATH?.trim().replace(/^\/?/, "/").replace(/\/$/, "") ?? "";
  let sent = 0;
  for (const row of rows.results ?? []) {
    const productUrl = `${origin.replace(/\/$/, "")}${basePath === "/" ? "" : basePath}/products/${encodeURIComponent(row.slug)}`;
    // Best-effort, same as every other transactional email in this codebase
    // (sendOrderEmail's own call sites) - a Resend outage stamps notified_at
    // anyway rather than retrying forever, since the next cron tick would
    // otherwise re-email every prior success too (no per-row failure state).
    await sendRestockNotificationEmail(env, { email: row.email, productName: row.name, productUrl }).catch(() => {});
    await env.DB.prepare("update restock_notifications set notified_at = CURRENT_TIMESTAMP where id = ?").bind(row.id).run();
    sent += 1;
  }
  return { sent };
}
