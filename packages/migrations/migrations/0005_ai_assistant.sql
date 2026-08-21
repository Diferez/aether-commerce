PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  session_hash TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'es-CO',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','deleted','expired')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
  content_redacted TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_action_audit (
  event_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  user_or_session_hash TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  normalized_arguments TEXT NOT NULL,
  target_entity_id TEXT,
  idempotency_key TEXT NOT NULL,
  authorization_result TEXT NOT NULL,
  execution_status TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  id TEXT PRIMARY KEY,
  usage_date TEXT NOT NULL,
  user_or_session_hash TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  llm_call_count INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(usage_date, user_or_session_hash)
);

CREATE TABLE IF NOT EXISTS ai_evaluation_cases (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'es-CO',
  input_text TEXT NOT NULL,
  expected_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_session_hash ON ai_conversations(session_hash);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_audit_thread_id ON ai_action_audit(thread_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_audit_request_id ON ai_action_audit(request_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_date ON ai_usage_daily(usage_date);
