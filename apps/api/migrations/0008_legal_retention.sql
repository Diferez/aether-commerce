create index if not exists idx_ai_conversations_expires_at
  on ai_conversations(expires_at);

create index if not exists idx_ai_action_audit_created_at
  on ai_action_audit(created_at);

create index if not exists idx_carts_updated_at
  on carts(updated_at);
