import {
  AgentConversationMemory,
  type AgentConversationMemoryRepository
} from "@aether/agent-core";

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
};

type ConversationRow = {
  id: string;
  session_hash: string;
  locale: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  role: string;
  content_redacted: string | null;
  payload_json: string;
  created_at: string;
};

/** D1 implementation for the provider-neutral assistant conversation memory. */
export function createD1ConversationMemory(db: D1Database): AgentConversationMemory {
  const repository: AgentConversationMemoryRepository = {
    async findConversation(threadId) {
      const row = await db
        .prepare("select id, session_hash, locale, status, created_at, updated_at from ai_conversations where id = ?")
        .bind(threadId)
        .first<ConversationRow>();
      if (!row) return null;
      return {
        id: row.id,
        sessionHash: row.session_hash,
        locale: row.locale,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    },
    async listMessages(threadId) {
      const rows = await db
        .prepare("select id, role, content_redacted, payload_json, created_at from ai_messages where conversation_id = ? order by created_at asc")
        .bind(threadId)
        .all<MessageRow>();
      return (rows.results || []).map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content_redacted,
        payload: safeJson(row.payload_json),
        createdAt: row.created_at
      }));
    },
    async persistMessage(input) {
      await db
        .prepare(
          `insert into ai_conversations (id, session_hash, locale, status, metadata_json, expires_at, created_at, updated_at)
           values (?, ?, ?, 'active', '{}', datetime('now', '+30 days'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           on conflict(id) do update set updated_at = CURRENT_TIMESTAMP, locale = excluded.locale`
        )
        .bind(input.threadId, input.sessionHash, input.locale)
        .run();
      await db
        .prepare("insert into ai_messages (id, conversation_id, role, content_redacted, payload_json, created_at) values (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
        .bind(crypto.randomUUID(), input.threadId, input.role, input.content.slice(0, 4000), JSON.stringify(input.payload).slice(0, 12000))
        .run();
    },
    async deleteConversation(threadId) {
      await db.prepare("update ai_conversations set status = 'deleted', updated_at = CURRENT_TIMESTAMP where id = ?").bind(threadId).run();
      await db.prepare("delete from ai_messages where conversation_id = ?").bind(threadId).run();
    }
  };
  return new AgentConversationMemory(repository);
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
