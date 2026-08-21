-- Tracks whether a product's current low-stock/out-of-stock dip has already
-- triggered an owner email (see sendLowStockAlerts in
-- apps/api/src/services/low-stock-alerts.ts, run from the scheduled
-- worker) - without this, every 5-minute cron tick would re-email the same
-- still-low product forever. Cleared back to NULL once the product is
-- restocked above its threshold, so the next dip alerts again.
ALTER TABLE products ADD COLUMN low_stock_alerted_at TEXT;
