-- Backs the storefront's "notify me when back in stock" button, which
-- previously had no endpoint to call. A shopper subscribes an email to one
-- out-of-stock product; the scheduled worker (see apps/api/src/index.ts)
-- emails every still-unnotified subscriber once that product's stock rises
-- above zero, then stamps notified_at so it never emails the same
-- subscription twice.
CREATE TABLE IF NOT EXISTS restock_notifications (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  email TEXT NOT NULL,
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, email)
);

CREATE INDEX IF NOT EXISTS idx_restock_notifications_pending ON restock_notifications(product_id, notified_at);
