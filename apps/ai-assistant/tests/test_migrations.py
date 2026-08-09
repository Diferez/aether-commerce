from pathlib import Path

from app.storage import CREATE_TABLES_SQL


def test_postgres_migration_file_contains_required_tables() -> None:
    migration = (Path(__file__).resolve().parents[1] / "migrations" / "0001_initial.sql").read_text(encoding="utf-8")
    for table in ["ai_conversations", "ai_messages", "ai_action_audit", "ai_usage_daily"]:
        assert f"CREATE TABLE IF NOT EXISTS {table}" in migration
    assert "idx_ai_action_audit_request_id" in migration
    assert "idx_ai_usage_daily_usage_date" in migration


def test_runtime_schema_keeps_required_indexes_in_sync_with_migration() -> None:
    migration = (Path(__file__).resolve().parents[1] / "migrations" / "0001_initial.sql").read_text(encoding="utf-8")

    for index_name in [
        "idx_ai_conversations_session_hash",
        "idx_ai_conversations_user_id",
        "idx_ai_messages_conversation_id",
        "idx_ai_action_audit_thread_id",
        "idx_ai_action_audit_request_id",
        "idx_ai_usage_daily_usage_date",
    ]:
        assert index_name in migration
        assert index_name in CREATE_TABLES_SQL
