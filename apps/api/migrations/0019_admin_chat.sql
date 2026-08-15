-- Aether Chat: admin-scoped conversational agent. Separate from the
-- storefront assistant's ai_conversations/ai_messages/ai_action_audit
-- tables (migration 0005) - different auth model (admin actor, not a
-- shopper's own JWT), different audit trail (mutations still land in the
-- existing audit_logs table via writeAuditLog, so they show up in the same
-- GET /admin/audit view as every other admin action).

create table if not exists admin_chat_conversations (
  id text primary key,
  actor_id text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  system_prompt_version text not null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create index if not exists idx_admin_chat_conversations_actor_id on admin_chat_conversations(actor_id);

create table if not exists admin_chat_messages (
  id text primary key,
  conversation_id text not null references admin_chat_conversations(id),
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text,
  tool_calls_json text,
  created_at text not null default current_timestamp
);

create index if not exists idx_admin_chat_messages_conversation_id on admin_chat_messages(conversation_id);

-- One row per prepare_* tool call that would mutate data. params_json is
-- computed entirely server-side at creation time - the model/client only
-- ever reference the row by id (operationId), never supply or edit its
-- parameters. result_json is filled in once and replayed on a duplicate
-- confirm instead of re-executing (see services/admin-chat/pending-actions.ts).
create table if not exists admin_chat_pending_actions (
  id text primary key,
  conversation_id text not null references admin_chat_conversations(id),
  actor_id text not null,
  tool_name text not null,
  target_type text not null,
  target_id text,
  params_json text not null,
  diff_json text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'expired', 'cancelled', 'failed')),
  idempotency_key text not null unique,
  request_id text not null,
  result_json text,
  expires_at text not null,
  created_at text not null default current_timestamp,
  resolved_at text
);

create index if not exists idx_admin_chat_pending_actions_expires_at on admin_chat_pending_actions(expires_at);
create index if not exists idx_admin_chat_pending_actions_conversation_id on admin_chat_pending_actions(conversation_id);
