import type { Env } from "../types";
import { sendLowStockAlertEmail } from "./email";

type LowStockRow = { id: string; name: string; stock: number };

/**
 * Emails the store owner (CONTACT_RECIPIENT_EMAIL, same recipient the
 * contact form uses) once a product dips at or below its low-stock
 * threshold, instead of relying on someone remembering to check the
 * dashboard. Called from the scheduled worker (apps/api/src/index.ts).
 *
 * Alerts once per dip: low_stock_alerted_at gates re-sending for a product
 * that's still low, and is cleared once the product is restocked above its
 * threshold so the next dip alerts again.
 */
export async function sendLowStockAlerts(env: Env): Promise<{ alerted: number }> {
  await env.DB.prepare(
    "update products set low_stock_alerted_at = null where low_stock_alerted_at is not null and stock > low_stock_threshold"
  ).run();

  const rows = await env.DB.prepare(
    "select id, name, stock from products where stock <= low_stock_threshold and low_stock_alerted_at is null"
  ).all<LowStockRow>();

  const products = rows.results ?? [];
  if (products.length === 0) return { alerted: 0 };

  await sendLowStockAlertEmail(env, products).catch(() => {});
  await env.DB.batch(
    products.map((product) =>
      env.DB.prepare("update products set low_stock_alerted_at = CURRENT_TIMESTAMP where id = ?").bind(product.id)
    )
  );
  return { alerted: products.length };
}
