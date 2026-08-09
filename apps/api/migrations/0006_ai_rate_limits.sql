PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_rate_limit_buckets (
  id TEXT PRIMARY KEY,
  scope_hash TEXT NOT NULL,
  window_key TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scope_hash, window_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_rate_limit_buckets_expires_at ON ai_rate_limit_buckets(expires_at);
