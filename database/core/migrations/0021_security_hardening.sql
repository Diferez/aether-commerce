-- Immutable checkout snapshots prevent a shopper from changing the cart
-- after Stripe has calculated the amount but before its webhook creates the
-- order. Orders are always built from this server-side snapshot.
CREATE TABLE IF NOT EXISTS checkout_snapshots (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  cart_payload_json TEXT NOT NULL,
  amount_total INTEGER NOT NULL CHECK (amount_total >= 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'expired')),
  provider_session_id TEXT UNIQUE,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checkout_snapshots_cart_id ON checkout_snapshots(cart_id);
CREATE INDEX IF NOT EXISTS idx_checkout_snapshots_expires_at ON checkout_snapshots(status, expires_at);

-- Rebuild webhook_events so idempotency is scoped by provider and every
-- event has an explicit receipt timestamp. This also makes retries of a
-- failed delivery observable without colliding with another provider.
CREATE TABLE webhook_events_hardened (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed', 'retrying', 'ignored')),
  attempts INTEGER NOT NULL DEFAULT 0,
  request_id TEXT,
  error_code TEXT,
  error_message TEXT,
  processing_started_at TEXT,
  next_retry_at TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_event_id)
);

INSERT INTO webhook_events_hardened
  (id, provider, provider_event_id, payload_json, status, attempts, request_id, error_code, error_message,
   processing_started_at, next_retry_at, received_at, processed_at, created_at, updated_at)
SELECT id, provider, provider_event_id, payload_json, status, attempts, request_id, error_code, error_message,
       processing_started_at, next_retry_at, created_at, processed_at, created_at, updated_at
FROM webhook_events;

DROP TABLE webhook_events;
ALTER TABLE webhook_events_hardened RENAME TO webhook_events;
CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_provider_created_at ON webhook_events(provider, created_at);

