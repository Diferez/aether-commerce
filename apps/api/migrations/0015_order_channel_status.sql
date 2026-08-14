-- Additive only - orders.state (the 17-step enum in packages/core/src/order-state.ts)
-- and everything that already writes it (the Stripe webhook via
-- createOrderFromStripeSession, PATCH /admin/orders/:id/status) are
-- untouched. These columns are tracked independently going forward so
-- payment and fulfillment stop being conflated in the admin UI, without
-- touching the one path that handles real money in production.
ALTER TABLE orders ADD COLUMN channel TEXT NOT NULL DEFAULT 'stripe' CHECK (channel IN ('stripe', 'whatsapp'));
ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded'));
ALTER TABLE orders ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled' CHECK (fulfillment_status IN ('unfulfilled', 'processing', 'shipped', 'delivered', 'cancelled'));
ALTER TABLE orders ADD COLUMN internal_notes TEXT;
ALTER TABLE orders ADD COLUMN tracking_carrier TEXT;
ALTER TABLE orders ADD COLUMN tracking_number TEXT;
ALTER TABLE orders ADD COLUMN tracking_url TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel);
