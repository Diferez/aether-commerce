ALTER TABLE orders ADD COLUMN stock_restored_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_reservations_active_cart_product
  ON inventory_reservations(cart_id, product_id) WHERE status = 'active';
