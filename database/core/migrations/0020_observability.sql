-- Extends audit_logs (migration 0001) with the fields needed to actually
-- investigate an incident: which request produced this entry (request_id,
-- cross-referenced against logs and Sentry), what role the actor held at
-- the time (roles can change after the fact), and where the request came
-- from. payload_json (existing) is kept as-is for every current
-- writeAuditLog() call site and every existing row - previous_data/new_data
-- are new, optional columns only the new auditService populates, for a real
-- before/after diff instead of one opaque blob.
ALTER TABLE audit_logs ADD COLUMN actor_role TEXT;
ALTER TABLE audit_logs ADD COLUMN request_id TEXT;
ALTER TABLE audit_logs ADD COLUMN ip_address TEXT;
ALTER TABLE audit_logs ADD COLUMN user_agent TEXT;
ALTER TABLE audit_logs ADD COLUMN previous_data TEXT;
ALTER TABLE audit_logs ADD COLUMN new_data TEXT;

-- One index per real query this table needs to serve (GET /admin/audit's
-- date-descending list, and its actor/action/entity/requestId filters) -
-- D1 charges per row written, so no index is added speculatively.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);

-- Extends webhook_events (migration 0001) with processing-status tracking.
-- The existing dedup key - the UNIQUE provider_event_id and the
-- on-conflict-do-nothing insert already in routes/webhooks.ts - is
-- untouched; these columns are additive and default-backfilled so existing
-- rows and the existing insert statement keep working exactly as before.
ALTER TABLE webhook_events ADD COLUMN status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed', 'retrying', 'ignored'));
ALTER TABLE webhook_events ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE webhook_events ADD COLUMN request_id TEXT;
ALTER TABLE webhook_events ADD COLUMN error_code TEXT;
ALTER TABLE webhook_events ADD COLUMN error_message TEXT;
ALTER TABLE webhook_events ADD COLUMN processing_started_at TEXT;
ALTER TABLE webhook_events ADD COLUMN next_retry_at TEXT;

-- Backfill: every row that existed before this migration already has
-- processed_at set by the old insert statement (it was written
-- unconditionally on receipt, not on actual processing completion) - mark
-- those as 'processed' so the status column starts consistent with what
-- actually happened, instead of every historical row misleadingly reading
-- 'received' forever.
UPDATE webhook_events SET status = 'processed' WHERE processed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_created_at ON webhook_events(provider, created_at);

-- Lightweight, sampled operational metrics (Fase 12) - aggregated counters
-- per (metric_name, bucket) rather than one row per event, so this stays
-- cheap even at real traffic volume. bucket is a coarse time bucket key
-- (e.g. "2026-08-15T14:00" for an hourly counter) computed by the
-- application, not a foreign key - this table has no relation to the event
-- it's counting, only ever aggregates.
CREATE TABLE IF NOT EXISTS operational_metrics (
  id TEXT PRIMARY KEY,
  metric_name TEXT NOT NULL,
  bucket TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (metric_name, bucket)
);

CREATE INDEX IF NOT EXISTS idx_operational_metrics_name_bucket ON operational_metrics(metric_name, bucket);

-- Tracks the last successful run of each critical scheduled/background task
-- (currently just inventory reservation expiry) - one row per task, updated
-- in place, so "system health" can report staleness without scanning a
-- history table. Not an audit trail - see audit_logs for that.
CREATE TABLE IF NOT EXISTS task_runs (
  task_name TEXT PRIMARY KEY,
  last_run_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'failed')),
  detail TEXT
);
