import asyncio
from datetime import UTC, datetime
from pathlib import Path

import app.storage as storage_module
from app.config import Settings
from app.rate_limit import ConcurrencyLimitExceeded, InMemoryConcurrencyLimiter, InMemoryRateLimiter
from app.storage import InMemoryAssistantStorage, SQLiteAssistantStorage, create_storage


def test_create_storage_selects_configured_backend(tmp_path: Path) -> None:
    memory_storage = create_storage(Settings(database_url=""))
    assert isinstance(memory_storage, InMemoryAssistantStorage)

    sqlite_storage = create_storage(Settings(database_url=f"sqlite:///{tmp_path / 'assistant.sqlite3'}"))
    assert isinstance(sqlite_storage, SQLiteAssistantStorage)

    class FakePostgresStorage:
        def __init__(self, database_url: str) -> None:
            self.database_url = database_url

    original = storage_module.PostgresAssistantStorage
    try:
        storage_module.PostgresAssistantStorage = FakePostgresStorage  # type: ignore[assignment]
        postgres_storage = create_storage(Settings(database_url="postgresql://user:pass@localhost:5432/aether"))
    finally:
        storage_module.PostgresAssistantStorage = original

    assert isinstance(postgres_storage, FakePostgresStorage)
    assert postgres_storage.database_url == "postgresql://user:pass@localhost:5432/aether"


def test_sqlite_storage_persists_and_deletes_conversation(tmp_path: Path) -> None:
    async def run() -> None:
        storage = SQLiteAssistantStorage(str(tmp_path / "assistant.sqlite3"))
        await storage.ensure_conversation("thread-1", "session-hash", None, "es-CO", 30)
        await storage.save_message("thread-1", "user", None, {"message": "redacted"})
        await storage.audit_action(
            {
                "event_id": "event-1",
                "request_id": "request-1",
                "thread_id": "thread-1",
                "user_or_session_hash": "session-hash",
                "tool_name": "add_to_cart",
                "normalized_arguments": "product:variant:1",
                "target_entity_id": "product",
                "idempotency_key": "idem-1",
                "authorization_result": "allowed",
                "execution_status": "succeeded",
                "error_code": None,
            }
        )
        messages = await storage.list_messages("thread-1", 10)
        assert len(messages) == 1
        assert messages[0].payload["message"] == "redacted"
        await storage.delete_conversation("thread-1")
        assert await storage.list_messages("thread-1", 10) == []

    asyncio.run(run())


def test_sqlite_storage_tracks_daily_usage(tmp_path: Path) -> None:
    async def run() -> None:
        storage = SQLiteAssistantStorage(str(tmp_path / "assistant.sqlite3"))
        await storage.increment_daily_usage("project", "2026-07-19", request_count=1)
        await storage.increment_daily_usage("project", "2026-07-19", llm_calls=2, tool_calls=3)

        usage = await storage.get_daily_usage("project", "2026-07-19")
        assert usage == {"request_count": 1, "llm_calls": 2, "tool_calls": 3}
        assert await storage.get_daily_usage("project", "2026-07-20") == {
            "request_count": 0,
            "llm_calls": 0,
            "tool_calls": 0,
        }

    asyncio.run(run())


def test_sqlite_storage_lists_audit_events_by_thread(tmp_path: Path) -> None:
    async def run() -> None:
        storage = SQLiteAssistantStorage(str(tmp_path / "assistant.sqlite3"))
        await storage.audit_action(
            {
                "event_id": "event-1",
                "request_id": "request-1",
                "thread_id": "thread-1",
                "user_or_session_hash": "session-hash",
                "tool_name": "add_to_cart",
                "normalized_arguments": "product:variant:1",
                "target_entity_id": "product",
                "idempotency_key": "idem-1",
                "authorization_result": "allowed",
                "execution_status": "succeeded",
                "error_code": None,
            }
        )
        events = await storage.list_audit_events(thread_id="thread-1")
        assert len(events) == 1
        assert events[0]["event_id"] == "event-1"
        assert await storage.list_audit_events(thread_id="missing") == []

    asyncio.run(run())


def test_sqlite_storage_reads_conversation_metadata(tmp_path: Path) -> None:
    async def run() -> None:
        storage = SQLiteAssistantStorage(str(tmp_path / "assistant.sqlite3"))
        await storage.ensure_conversation("thread-1", "session-hash", "user-hash-123", "es-CO", 30)

        metadata = await storage.get_conversation_metadata("thread-1")

        assert metadata is not None
        assert metadata["id"] == "thread-1"
        assert metadata["session_hash"] == "session-hash"
        assert metadata["user_id"] == "user-hash-123"
        assert metadata["status"] == "active"
        assert await storage.get_conversation_metadata("missing-thread") is None

    asyncio.run(run())


def test_sqlite_storage_deletes_conversations_by_user_hash(tmp_path: Path) -> None:
    async def run() -> None:
        storage = SQLiteAssistantStorage(str(tmp_path / "assistant.sqlite3"))
        await storage.ensure_conversation("thread-1", "session-hash", "user-hash-123", "es-CO", 30)
        await storage.ensure_conversation("thread-2", "session-hash", "other-user-hash", "es-CO", 30)
        await storage.save_message("thread-1", "user", None, {"message": "private"})
        await storage.save_message("thread-2", "user", None, {"message": "keep"})

        deleted = await storage.delete_conversations_by_user_hash("user-hash-123")

        assert deleted == 1
        assert await storage.list_messages("thread-1", 10) == []
        assert len(await storage.list_messages("thread-2", 10)) == 1

    asyncio.run(run())


def test_sqlite_storage_purges_expired_conversations(tmp_path: Path) -> None:
    async def run() -> None:
        storage = SQLiteAssistantStorage(str(tmp_path / "assistant.sqlite3"))
        await storage.ensure_conversation("expired-thread", "session-hash", None, "es-CO", -1)
        await storage.ensure_conversation("active-thread", "session-hash", None, "es-CO", 30)
        await storage.save_message("expired-thread", "user", None, {"message": "remove"})
        await storage.save_message("active-thread", "user", None, {"message": "keep"})

        deleted = await storage.purge_expired_conversations(datetime.now(UTC).isoformat())

        assert deleted == 1
        assert await storage.list_messages("expired-thread", 10) == []
        assert len(await storage.list_messages("active-thread", 10)) == 1

    asyncio.run(run())


def test_sqlite_storage_purge_keeps_unexpired_conversations(tmp_path: Path) -> None:
    async def run() -> None:
        storage = SQLiteAssistantStorage(str(tmp_path / "assistant.sqlite3"))
        await storage.ensure_conversation("active-thread", "session-hash", None, "es-CO", 30)
        await storage.save_message("active-thread", "user", None, {"message": "keep"})

        deleted = await storage.purge_expired_conversations("2000-01-01T00:00:00+00:00")

        assert deleted == 0
        assert len(await storage.list_messages("active-thread", 10)) == 1

    asyncio.run(run())


def test_rate_limiter_blocks_after_minute_limit() -> None:
    async def run() -> None:
        settings = Settings(ai_rate_limit_messages_per_minute=2, ai_rate_limit_messages_per_hour=10)
        limiter = InMemoryRateLimiter(settings)
        assert (await limiter.check("session")).allowed
        assert (await limiter.check("session")).allowed
        third = await limiter.check("session")
        assert not third.allowed
        assert third.reason == "minute_limit"

    asyncio.run(run())


def test_rate_limiter_blocks_after_anonymous_day_limit() -> None:
    async def run() -> None:
        settings = Settings(ai_rate_limit_messages_per_minute=10, ai_rate_limit_messages_per_hour=10)
        limiter = InMemoryRateLimiter(settings)
        assert (await limiter.check("anonymous", day_limit=2, day_reason="anonymous_day_limit")).allowed
        assert (await limiter.check("anonymous", day_limit=2, day_reason="anonymous_day_limit")).allowed
        third = await limiter.check("anonymous", day_limit=2, day_reason="anonymous_day_limit")
        assert not third.allowed
        assert third.reason == "anonymous_day_limit"

    asyncio.run(run())


def test_in_memory_concurrency_limiter_blocks_when_full() -> None:
    async def run() -> None:
        limiter = InMemoryConcurrencyLimiter(Settings(ai_max_concurrent_requests=1))
        async with limiter.slot():
            try:
                async with limiter.slot():
                    raise AssertionError("second slot should not be acquired")
            except ConcurrencyLimitExceeded:
                pass

        async with limiter.slot():
            assert limiter.active == 1
        assert limiter.active == 0

    asyncio.run(run())
