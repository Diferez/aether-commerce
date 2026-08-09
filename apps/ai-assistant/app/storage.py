import asyncio
import json
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.config import Settings


@dataclass(frozen=True)
class StoredMessage:
    role: str
    content_redacted: str | None
    payload: dict[str, Any]


class AssistantStorage:
    async def ensure_conversation(
        self,
        thread_id: str,
        session_hash: str,
        user_id: str | None,
        locale: str,
        retention_days: int,
    ) -> None:
        raise NotImplementedError

    async def save_message(
        self,
        conversation_id: str,
        role: str,
        content_redacted: str | None,
        payload: dict[str, Any],
    ) -> None:
        raise NotImplementedError

    async def list_messages(self, conversation_id: str, limit: int) -> list[StoredMessage]:
        raise NotImplementedError

    async def get_conversation_metadata(self, conversation_id: str) -> dict[str, Any] | None:
        raise NotImplementedError

    async def delete_conversation(self, conversation_id: str) -> None:
        raise NotImplementedError

    async def delete_conversations_by_user_hash(self, user_hash: str) -> int:
        raise NotImplementedError

    async def purge_expired_conversations(self, now_iso: str) -> int:
        raise NotImplementedError

    async def audit_action(self, event: dict[str, Any]) -> None:
        raise NotImplementedError

    async def list_audit_events(
        self,
        *,
        thread_id: str | None = None,
        request_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        raise NotImplementedError

    async def get_daily_usage(self, scope_hash: str, usage_date: str) -> dict[str, int]:
        raise NotImplementedError

    async def increment_daily_usage(
        self,
        scope_hash: str,
        usage_date: str,
        *,
        request_count: int = 0,
        llm_calls: int = 0,
        tool_calls: int = 0,
    ) -> None:
        raise NotImplementedError


class InMemoryAssistantStorage(AssistantStorage):
    def __init__(self) -> None:
        self.conversations: dict[str, dict[str, Any]] = {}
        self.messages: dict[str, list[StoredMessage]] = {}
        self.audit_events: list[dict[str, Any]] = []
        self.daily_usage: dict[tuple[str, str], dict[str, int]] = {}

    async def ensure_conversation(
        self,
        thread_id: str,
        session_hash: str,
        user_id: str | None,
        locale: str,
        retention_days: int,
    ) -> None:
        self.conversations[thread_id] = {
            "id": thread_id,
            "session_hash": session_hash,
            "user_id": user_id,
            "locale": locale,
            "expires_at": (datetime.now(UTC) + timedelta(days=retention_days)).isoformat(),
        }

    async def save_message(
        self,
        conversation_id: str,
        role: str,
        content_redacted: str | None,
        payload: dict[str, Any],
    ) -> None:
        self.messages.setdefault(conversation_id, []).append(StoredMessage(role, content_redacted, payload))

    async def list_messages(self, conversation_id: str, limit: int) -> list[StoredMessage]:
        return self.messages.get(conversation_id, [])[-limit:]

    async def get_conversation_metadata(self, conversation_id: str) -> dict[str, Any] | None:
        conversation = self.conversations.get(conversation_id)
        return conversation.copy() if conversation else None

    async def delete_conversation(self, conversation_id: str) -> None:
        if conversation_id in self.conversations:
            self.conversations[conversation_id]["status"] = "deleted"
        self.messages.pop(conversation_id, None)

    async def delete_conversations_by_user_hash(self, user_hash: str) -> int:
        deleted = 0
        for conversation_id, conversation in list(self.conversations.items()):
            if conversation.get("user_id") == user_hash:
                conversation["status"] = "deleted"
                self.messages.pop(conversation_id, None)
                deleted += 1
        return deleted

    async def purge_expired_conversations(self, now_iso: str) -> int:
        deleted = 0
        for conversation_id, conversation in list(self.conversations.items()):
            expires_at = str(conversation.get("expires_at") or "")
            if expires_at and expires_at <= now_iso and conversation.get("status") != "expired":
                conversation["status"] = "expired"
                self.messages.pop(conversation_id, None)
                deleted += 1
        return deleted

    async def audit_action(self, event: dict[str, Any]) -> None:
        self.audit_events.append(event)

    async def list_audit_events(
        self,
        *,
        thread_id: str | None = None,
        request_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        events = self.audit_events
        if thread_id:
            events = [event for event in events if event.get("thread_id") == thread_id]
        if request_id:
            events = [event for event in events if event.get("request_id") == request_id]
        return list(reversed(events[-limit:]))

    async def get_daily_usage(self, scope_hash: str, usage_date: str) -> dict[str, int]:
        return self.daily_usage.get(
            (scope_hash, usage_date),
            {"request_count": 0, "llm_calls": 0, "tool_calls": 0},
        ).copy()

    async def increment_daily_usage(
        self,
        scope_hash: str,
        usage_date: str,
        *,
        request_count: int = 0,
        llm_calls: int = 0,
        tool_calls: int = 0,
    ) -> None:
        usage = self.daily_usage.setdefault(
            (scope_hash, usage_date),
            {"request_count": 0, "llm_calls": 0, "tool_calls": 0},
        )
        usage["request_count"] += request_count
        usage["llm_calls"] += llm_calls
        usage["tool_calls"] += tool_calls


CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  session_hash TEXT NOT NULL,
  locale TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content_redacted TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  scope_hash TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  llm_calls INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope_hash, usage_date)
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_session_hash ON ai_conversations(session_hash);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_audit_thread_id ON ai_action_audit(thread_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_audit_request_id ON ai_action_audit(request_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_usage_date ON ai_usage_daily(usage_date);
"""


class SQLiteAssistantStorage(AssistantStorage):
    def __init__(self, path: str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def _init_schema(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                CREATE_TABLES_SQL.replace("TIMESTAMPTZ", "TEXT")
            )

    async def ensure_conversation(
        self,
        thread_id: str,
        session_hash: str,
        user_id: str | None,
        locale: str,
        retention_days: int,
    ) -> None:
        expires_at = (datetime.now(UTC) + timedelta(days=retention_days)).isoformat()

        def write() -> None:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO ai_conversations (id, user_id, session_hash, locale, expires_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(id) DO UPDATE SET
                      user_id = excluded.user_id,
                      session_hash = excluded.session_hash,
                      locale = excluded.locale,
                      expires_at = excluded.expires_at,
                      updated_at = CURRENT_TIMESTAMP
                    """,
                    (thread_id, user_id, session_hash, locale, expires_at),
                )

        await asyncio.to_thread(write)

    async def save_message(
        self,
        conversation_id: str,
        role: str,
        content_redacted: str | None,
        payload: dict[str, Any],
    ) -> None:
        def write() -> None:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO ai_messages (id, conversation_id, role, content_redacted, payload_json)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (str(uuid4()), conversation_id, role, content_redacted, json.dumps(payload)),
                )

        await asyncio.to_thread(write)

    async def list_messages(self, conversation_id: str, limit: int) -> list[StoredMessage]:
        def read() -> list[StoredMessage]:
            with self._connect() as connection:
                rows = connection.execute(
                    """
                    SELECT role, content_redacted, payload_json
                    FROM ai_messages
                    WHERE conversation_id = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (conversation_id, limit),
                ).fetchall()
            return [
                StoredMessage(row["role"], row["content_redacted"], json.loads(row["payload_json"] or "{}"))
                for row in reversed(rows)
            ]

        return await asyncio.to_thread(read)

    async def get_conversation_metadata(self, conversation_id: str) -> dict[str, Any] | None:
        def read() -> dict[str, Any] | None:
            with self._connect() as connection:
                row = connection.execute(
                    """
                    SELECT id, user_id, session_hash, locale, status, expires_at
                    FROM ai_conversations
                    WHERE id = ?
                    """,
                    (conversation_id,),
                ).fetchone()
            return dict(row) if row else None

        return await asyncio.to_thread(read)

    async def delete_conversation(self, conversation_id: str) -> None:
        def write() -> None:
            with self._connect() as connection:
                connection.execute(
                    "UPDATE ai_conversations SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (conversation_id,),
                )
                connection.execute("DELETE FROM ai_messages WHERE conversation_id = ?", (conversation_id,))

        await asyncio.to_thread(write)

    async def delete_conversations_by_user_hash(self, user_hash: str) -> int:
        def write() -> int:
            with self._connect() as connection:
                rows = connection.execute("SELECT id FROM ai_conversations WHERE user_id = ?", (user_hash,)).fetchall()
                conversation_ids = [str(row["id"]) for row in rows]
                connection.execute(
                    "UPDATE ai_conversations SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
                    (user_hash,),
                )
                for conversation_id in conversation_ids:
                    connection.execute("DELETE FROM ai_messages WHERE conversation_id = ?", (conversation_id,))
                return len(conversation_ids)

        return await asyncio.to_thread(write)

    async def purge_expired_conversations(self, now_iso: str) -> int:
        def write() -> int:
            with self._connect() as connection:
                rows = connection.execute(
                    "SELECT id FROM ai_conversations WHERE expires_at IS NOT NULL AND expires_at <= ? AND status != 'expired'",
                    (now_iso,),
                ).fetchall()
                conversation_ids = [str(row["id"]) for row in rows]
                connection.execute(
                    """
                    UPDATE ai_conversations
                    SET status = 'expired', updated_at = CURRENT_TIMESTAMP
                    WHERE expires_at IS NOT NULL AND expires_at <= ? AND status != 'expired'
                    """,
                    (now_iso,),
                )
                for conversation_id in conversation_ids:
                    connection.execute("DELETE FROM ai_messages WHERE conversation_id = ?", (conversation_id,))
                return len(conversation_ids)

        return await asyncio.to_thread(write)

    async def audit_action(self, event: dict[str, Any]) -> None:
        def write() -> None:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT OR IGNORE INTO ai_action_audit (
                      event_id, request_id, thread_id, user_or_session_hash, tool_name,
                      normalized_arguments, target_entity_id, idempotency_key,
                      authorization_result, execution_status, error_code
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event["event_id"],
                        event["request_id"],
                        event["thread_id"],
                        event["user_or_session_hash"],
                        event["tool_name"],
                        event["normalized_arguments"],
                        event.get("target_entity_id"),
                        event["idempotency_key"],
                        event["authorization_result"],
                        event["execution_status"],
                        event.get("error_code"),
                    ),
                )

        await asyncio.to_thread(write)

    async def list_audit_events(
        self,
        *,
        thread_id: str | None = None,
        request_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        def read() -> list[dict[str, Any]]:
            where: list[str] = []
            params: list[Any] = []
            if thread_id:
                where.append("thread_id = ?")
                params.append(thread_id)
            if request_id:
                where.append("request_id = ?")
                params.append(request_id)
            sql = """
                SELECT event_id, request_id, thread_id, user_or_session_hash, tool_name,
                       normalized_arguments, target_entity_id, idempotency_key,
                       authorization_result, execution_status, error_code, created_at
                FROM ai_action_audit
            """
            if where:
                sql += " WHERE " + " AND ".join(where)
            sql += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit)
            with self._connect() as connection:
                rows = connection.execute(sql, params).fetchall()
            return [dict(row) for row in rows]

        return await asyncio.to_thread(read)

    async def get_daily_usage(self, scope_hash: str, usage_date: str) -> dict[str, int]:
        def read() -> dict[str, int]:
            with self._connect() as connection:
                row = connection.execute(
                    """
                    SELECT request_count, llm_calls, tool_calls
                    FROM ai_usage_daily
                    WHERE scope_hash = ? AND usage_date = ?
                    """,
                    (scope_hash, usage_date),
                ).fetchone()
            if row is None:
                return {"request_count": 0, "llm_calls": 0, "tool_calls": 0}
            return {
                "request_count": int(row["request_count"]),
                "llm_calls": int(row["llm_calls"]),
                "tool_calls": int(row["tool_calls"]),
            }

        return await asyncio.to_thread(read)

    async def increment_daily_usage(
        self,
        scope_hash: str,
        usage_date: str,
        *,
        request_count: int = 0,
        llm_calls: int = 0,
        tool_calls: int = 0,
    ) -> None:
        def write() -> None:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO ai_usage_daily (
                      scope_hash, usage_date, request_count, llm_calls, tool_calls, updated_at
                    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(scope_hash, usage_date) DO UPDATE SET
                      request_count = request_count + excluded.request_count,
                      llm_calls = llm_calls + excluded.llm_calls,
                      tool_calls = tool_calls + excluded.tool_calls,
                      updated_at = CURRENT_TIMESTAMP
                    """,
                    (scope_hash, usage_date, request_count, llm_calls, tool_calls),
                )

        await asyncio.to_thread(write)


class PostgresAssistantStorage(AssistantStorage):
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url
        self._init_schema()

    def _connect(self):
        import psycopg

        return psycopg.connect(self.database_url)

    def _init_schema(self) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(CREATE_TABLES_SQL)
            connection.commit()

    async def ensure_conversation(
        self,
        thread_id: str,
        session_hash: str,
        user_id: str | None,
        locale: str,
        retention_days: int,
    ) -> None:
        expires_at = (datetime.now(UTC) + timedelta(days=retention_days)).isoformat()

        def write() -> None:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO ai_conversations (id, user_id, session_hash, locale, expires_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT(id) DO UPDATE SET
                          user_id = EXCLUDED.user_id,
                          session_hash = EXCLUDED.session_hash,
                          locale = EXCLUDED.locale,
                          expires_at = EXCLUDED.expires_at,
                          updated_at = CURRENT_TIMESTAMP
                        """,
                        (thread_id, user_id, session_hash, locale, expires_at),
                    )
                connection.commit()

        await asyncio.to_thread(write)

    async def save_message(
        self,
        conversation_id: str,
        role: str,
        content_redacted: str | None,
        payload: dict[str, Any],
    ) -> None:
        def write() -> None:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO ai_messages (id, conversation_id, role, content_redacted, payload_json)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (str(uuid4()), conversation_id, role, content_redacted, json.dumps(payload)),
                    )
                connection.commit()

        await asyncio.to_thread(write)

    async def list_messages(self, conversation_id: str, limit: int) -> list[StoredMessage]:
        def read() -> list[StoredMessage]:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT role, content_redacted, payload_json
                        FROM ai_messages
                        WHERE conversation_id = %s
                        ORDER BY created_at DESC
                        LIMIT %s
                        """,
                        (conversation_id, limit),
                    )
                    rows = cursor.fetchall()
            return [StoredMessage(row[0], row[1], json.loads(row[2] or "{}")) for row in reversed(rows)]

        return await asyncio.to_thread(read)

    async def get_conversation_metadata(self, conversation_id: str) -> dict[str, Any] | None:
        def read() -> dict[str, Any] | None:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT id, user_id, session_hash, locale, status, expires_at
                        FROM ai_conversations
                        WHERE id = %s
                        """,
                        (conversation_id,),
                    )
                    row = cursor.fetchone()
            if row is None:
                return None
            columns = ["id", "user_id", "session_hash", "locale", "status", "expires_at"]
            return dict(zip(columns, row, strict=False))

        return await asyncio.to_thread(read)

    async def delete_conversation(self, conversation_id: str) -> None:
        def write() -> None:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE ai_conversations SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                        (conversation_id,),
                    )
                    cursor.execute("DELETE FROM ai_messages WHERE conversation_id = %s", (conversation_id,))
                connection.commit()

        await asyncio.to_thread(write)

    async def delete_conversations_by_user_hash(self, user_hash: str) -> int:
        def write() -> int:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT id FROM ai_conversations WHERE user_id = %s", (user_hash,))
                    conversation_ids = [str(row[0]) for row in cursor.fetchall()]
                    cursor.execute(
                        "UPDATE ai_conversations SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE user_id = %s",
                        (user_hash,),
                    )
                    for conversation_id in conversation_ids:
                        cursor.execute("DELETE FROM ai_messages WHERE conversation_id = %s", (conversation_id,))
                connection.commit()
                return len(conversation_ids)

        return await asyncio.to_thread(write)

    async def purge_expired_conversations(self, now_iso: str) -> int:
        def write() -> int:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT id FROM ai_conversations
                        WHERE expires_at IS NOT NULL AND expires_at <= %s AND status != 'expired'
                        """,
                        (now_iso,),
                    )
                    conversation_ids = [str(row[0]) for row in cursor.fetchall()]
                    cursor.execute(
                        """
                        UPDATE ai_conversations
                        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
                        WHERE expires_at IS NOT NULL AND expires_at <= %s AND status != 'expired'
                        """,
                        (now_iso,),
                    )
                    for conversation_id in conversation_ids:
                        cursor.execute("DELETE FROM ai_messages WHERE conversation_id = %s", (conversation_id,))
                connection.commit()
                return len(conversation_ids)

        return await asyncio.to_thread(write)

    async def audit_action(self, event: dict[str, Any]) -> None:
        def write() -> None:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO ai_action_audit (
                          event_id, request_id, thread_id, user_or_session_hash, tool_name,
                          normalized_arguments, target_entity_id, idempotency_key,
                          authorization_result, execution_status, error_code
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT(event_id) DO NOTHING
                        """,
                        (
                            event["event_id"],
                            event["request_id"],
                            event["thread_id"],
                            event["user_or_session_hash"],
                            event["tool_name"],
                            event["normalized_arguments"],
                            event.get("target_entity_id"),
                            event["idempotency_key"],
                            event["authorization_result"],
                            event["execution_status"],
                            event.get("error_code"),
                        ),
                    )
                connection.commit()

        await asyncio.to_thread(write)

    async def list_audit_events(
        self,
        *,
        thread_id: str | None = None,
        request_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        def read() -> list[dict[str, Any]]:
            where: list[str] = []
            params: list[Any] = []
            if thread_id:
                where.append("thread_id = %s")
                params.append(thread_id)
            if request_id:
                where.append("request_id = %s")
                params.append(request_id)
            sql = """
                SELECT event_id, request_id, thread_id, user_or_session_hash, tool_name,
                       normalized_arguments, target_entity_id, idempotency_key,
                       authorization_result, execution_status, error_code, created_at
                FROM ai_action_audit
            """
            if where:
                sql += " WHERE " + " AND ".join(where)
            sql += " ORDER BY created_at DESC LIMIT %s"
            params.append(limit)
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(sql, params)
                    rows = cursor.fetchall()
            columns = [
                "event_id",
                "request_id",
                "thread_id",
                "user_or_session_hash",
                "tool_name",
                "normalized_arguments",
                "target_entity_id",
                "idempotency_key",
                "authorization_result",
                "execution_status",
                "error_code",
                "created_at",
            ]
            return [dict(zip(columns, row, strict=False)) for row in rows]

        return await asyncio.to_thread(read)

    async def get_daily_usage(self, scope_hash: str, usage_date: str) -> dict[str, int]:
        def read() -> dict[str, int]:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT request_count, llm_calls, tool_calls
                        FROM ai_usage_daily
                        WHERE scope_hash = %s AND usage_date = %s
                        """,
                        (scope_hash, usage_date),
                    )
                    row = cursor.fetchone()
            if row is None:
                return {"request_count": 0, "llm_calls": 0, "tool_calls": 0}
            return {"request_count": int(row[0]), "llm_calls": int(row[1]), "tool_calls": int(row[2])}

        return await asyncio.to_thread(read)

    async def increment_daily_usage(
        self,
        scope_hash: str,
        usage_date: str,
        *,
        request_count: int = 0,
        llm_calls: int = 0,
        tool_calls: int = 0,
    ) -> None:
        def write() -> None:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO ai_usage_daily (
                          scope_hash, usage_date, request_count, llm_calls, tool_calls, updated_at
                        ) VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT(scope_hash, usage_date) DO UPDATE SET
                          request_count = ai_usage_daily.request_count + EXCLUDED.request_count,
                          llm_calls = ai_usage_daily.llm_calls + EXCLUDED.llm_calls,
                          tool_calls = ai_usage_daily.tool_calls + EXCLUDED.tool_calls,
                          updated_at = CURRENT_TIMESTAMP
                        """,
                        (scope_hash, usage_date, request_count, llm_calls, tool_calls),
                    )
                connection.commit()

        await asyncio.to_thread(write)


def create_storage(settings: Settings) -> AssistantStorage:
    if settings.database_url.startswith("sqlite:///"):
        return SQLiteAssistantStorage(settings.database_url.removeprefix("sqlite:///"))
    if settings.database_url.startswith(("postgresql://", "postgres://")):
        return PostgresAssistantStorage(settings.database_url)
    return InMemoryAssistantStorage()
