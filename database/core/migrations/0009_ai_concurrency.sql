CREATE TABLE IF NOT EXISTS ai_concurrency_slots (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_concurrency_slots_expires_at ON ai_concurrency_slots(expires_at);
