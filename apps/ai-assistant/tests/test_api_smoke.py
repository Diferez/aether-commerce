import base64
import hashlib
import hmac
import json
import time

from fastapi.testclient import TestClient
from fastapi import HTTPException
from starlette.requests import Request

import app.main as main_module
from app.config import Settings, get_settings, parse_cors_allowed_origins
from app.main import app, production_readiness_issues, rate_limit_identities, run_graph_with_timeout, update_daily_budget_metrics
from app.observability import metrics
from app.rate_limit import InMemoryConcurrencyLimiter, InMemoryRateLimiter
from app.schemas import AssistantMessageRequest
from app.security import stable_hash
from app.storage import InMemoryAssistantStorage


def _sign_cart_token(secret: str, payload: dict[str, object]) -> str:
    encoded_payload = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii").rstrip("=")
    signature = hmac.new(secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{encoded_payload}.{encoded_signature}"


def test_health_ready_and_metrics_endpoints() -> None:
    with TestClient(app) as client:
        health = client.get("/healthz")
        ready = client.get("/readyz")
        metrics = client.get("/metrics")

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert ready.status_code == 200
    assert "gemini_configured" in ready.json()
    assert "production_ready" in ready.json()
    assert "readiness_issues" in ready.json()
    assert metrics.status_code == 200
    assert "ai_requests_total" in metrics.text


def test_production_readiness_requires_server_side_dependencies() -> None:
    issues = production_readiness_issues(Settings(ai_deployment_environment="production"))

    assert "gemini_api_key_missing" in issues
    assert "aether_cart_token_secret_missing" in issues
    assert "postgres_database_url_required" in issues
    assert "redis_url_missing" in issues
    assert "cors_origins_must_be_explicit" in issues


def test_production_readiness_accepts_complete_config() -> None:
    settings = Settings(
        ai_deployment_environment="production",
        gemini_api_key="configured",
        aether_cart_token_secret="shared-secret",
        database_url="postgresql://user:pass@db.example.com:5432/aether_ai",
        redis_url="redis://redis.example.com:6379",
        ai_cors_allowed_origins="https://store.example.com",
    )

    assert production_readiness_issues(settings) == []


def test_general_message_does_not_require_external_catalog() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/v1/assistant/messages",
            headers={"x-aether-session-id": "test-session"},
            json={
                "message": "Hola, puedes ayudarme?",
                "locale": "es-CO",
                "currency": "USD",
                "client_context": {"current_path": "/"},
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "GENERAL_STORE_QUESTION"
    assert payload["products"] == []
    assert payload["action"]["type"] == "NONE"


def test_stream_message_emits_required_safe_events() -> None:
    with TestClient(app) as client:
        with client.stream(
            "POST",
            "/v1/assistant/messages/stream",
            headers={"x-aether-session-id": "stream-session"},
            json={
                "message": "Hola, puedes ayudarme?",
                "locale": "es-CO",
                "currency": "USD",
                "client_context": {"current_path": "/"},
            },
        ) as response:
            body = response.read().decode("utf-8")

    assert response.status_code == 200
    assert "event: assistant.started" in body
    assert "event: assistant.status" in body
    assert "event: assistant.token" in body
    assert "event: assistant.completed" in body
    assert "chain of thought" not in body.lower()
    assert "GEMINI_API_KEY" not in body


def test_parse_cors_allowed_origins_trims_commas() -> None:
    assert parse_cors_allowed_origins("https://store.example.com, https://admin.example.com") == [
        "https://store.example.com",
        "https://admin.example.com",
    ]
    assert parse_cors_allowed_origins("") == ["*"]


def test_startup_runs_migrations_when_enabled() -> None:
    calls: list[str] = []
    settings = Settings(
        ai_run_migrations_on_startup=True,
        database_url="postgresql://user:pass@localhost:5432/aether_ai",
    )
    original_get_settings = main_module.get_settings
    original_run_migrations = main_module.run_migrations
    original_create_storage = main_module.create_storage
    try:
        main_module.get_settings = lambda: settings  # type: ignore[assignment]
        main_module.run_migrations = lambda database_url=None, migrations_dir=None: calls.append(str(database_url))  # type: ignore[assignment]
        main_module.create_storage = lambda current_settings: InMemoryAssistantStorage()  # type: ignore[assignment]
        with TestClient(app):
            pass
    finally:
        main_module.get_settings = original_get_settings
        main_module.run_migrations = original_run_migrations
        main_module.create_storage = original_create_storage

    assert calls == ["postgresql://user:pass@localhost:5432/aether_ai"]


def test_message_input_size_uses_configured_limit() -> None:
    settings = Settings(ai_max_input_characters=5)
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            client.app.state.storage = InMemoryAssistantStorage()
            client.app.state.rate_limiter = InMemoryRateLimiter(settings)
            response = client.post(
                "/v1/assistant/messages",
                headers={"x-aether-session-id": "limit-session"},
                json={
                    "message": "este mensaje es demasiado largo",
                    "locale": "es-CO",
                    "currency": "USD",
                    "client_context": {"current_path": "/"},
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 413
    assert response.json()["detail"] == "input_too_large"


def test_graph_execution_timeout_returns_safe_error() -> None:
    class SlowGraph:
        async def run(self, *args, **kwargs):
            import asyncio

            await asyncio.sleep(0.05)

    async def run() -> None:
        import asyncio

        try:
            await run_graph_with_timeout(
                SlowGraph(),
                request=AssistantMessageRequest(
                    message="Hola",
                    locale="es-CO",
                    currency="USD",
                ),
                cart_id=None,
                session_id="session-1",
                cart_token=None,
                user_id=None,
                settings=Settings(ai_request_timeout_seconds=0),
            )
        except HTTPException as exc:
            assert exc.status_code == 504
            assert exc.detail == "assistant_timeout"
            return
        raise AssertionError("timeout was not raised")

    import asyncio

    asyncio.run(run())


def test_daily_budget_blocks_after_configured_limit() -> None:
    settings = Settings(ai_daily_request_budget=1)
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            client.app.state.storage = InMemoryAssistantStorage()
            client.app.state.rate_limiter = InMemoryRateLimiter(settings)
            first = client.post(
                "/v1/assistant/messages",
                headers={"x-aether-session-id": "budget-session"},
                json={
                    "message": "Hola",
                    "locale": "es-CO",
                    "currency": "USD",
                    "client_context": {"current_path": "/"},
                },
            )
            second = client.post(
                "/v1/assistant/messages",
                headers={"x-aether-session-id": "budget-session"},
                json={
                    "message": "Hola de nuevo",
                    "locale": "es-CO",
                    "currency": "USD",
                    "client_context": {"current_path": "/"},
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["detail"] == "daily_budget_exceeded"


def test_message_endpoint_blocks_when_concurrency_limit_is_full() -> None:
    settings = Settings(ai_max_concurrent_requests=1)
    limiter = InMemoryConcurrencyLimiter(settings)
    limiter.active = 1
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            client.app.state.storage = InMemoryAssistantStorage()
            client.app.state.rate_limiter = InMemoryRateLimiter(settings)
            client.app.state.concurrency_limiter = limiter
            response = client.post(
                "/v1/assistant/messages",
                headers={"x-aether-session-id": "concurrency-session"},
                json={
                    "message": "Hola",
                    "locale": "es-CO",
                    "currency": "USD",
                    "client_context": {"current_path": "/"},
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 429
    assert response.json()["detail"] == "concurrency_limit"
    assert response.headers["retry-after"] == "10"


def test_daily_budget_metrics_expose_thresholds() -> None:
    update_daily_budget_metrics(100, 86)
    output = metrics.render_prometheus()

    assert "ai_daily_budget_usage_ratio 0.86" in output
    assert "ai_daily_budget_requests_remaining 14" in output
    assert "ai_daily_budget_threshold_70_reached 1" in output
    assert "ai_daily_budget_threshold_85_reached 1" in output
    assert "ai_daily_budget_threshold_95_reached 0" in output


def test_internal_audit_endpoint_requires_operations_token() -> None:
    settings = Settings(ai_operations_token="")
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            response = client.get("/v1/internal/audit/events?thread_id=thread-1")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


def test_internal_audit_endpoint_lists_authorized_events() -> None:
    settings = Settings(ai_operations_token="ops-token")
    storage = InMemoryAssistantStorage()
    storage.audit_events.append(
        {
            "event_id": "event-1",
            "request_id": "request-1",
            "thread_id": "thread-1",
            "user_or_session_hash": "session-hash",
            "tool_name": "add_to_cart",
            "normalized_arguments": "args",
            "target_entity_id": "product",
            "idempotency_key": "idem-1",
            "authorization_result": "allowed",
            "execution_status": "succeeded",
            "error_code": None,
        }
    )
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            client.app.state.storage = storage
            response = client.get(
                "/v1/internal/audit/events?thread_id=thread-1",
                headers={"x-aether-operations-token": "ops-token"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["events"][0]["event_id"] == "event-1"


def test_internal_delete_user_conversations_requires_operations_token() -> None:
    settings = Settings(ai_operations_token="")
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            response = client.delete("/v1/internal/conversations/user/user-hash-123")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


def test_internal_delete_user_conversations_removes_messages() -> None:
    async def seed(storage: InMemoryAssistantStorage) -> None:
        await storage.ensure_conversation("thread-1", "session-hash", "user-hash-123", "es-CO", 30)
        await storage.save_message("thread-1", "user", None, {"message": "private"})

    settings = Settings(ai_operations_token="ops-token")
    storage = InMemoryAssistantStorage()
    import asyncio

    asyncio.run(seed(storage))
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            client.app.state.storage = storage
            response = client.delete(
                "/v1/internal/conversations/user/user-hash-123",
                headers={"x-aether-operations-token": "ops-token"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["deleted"] == 1
    assert "thread-1" not in storage.messages


def test_internal_purge_expired_conversations_requires_operations_token() -> None:
    settings = Settings(ai_operations_token="")
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            response = client.post("/v1/internal/conversations/purge-expired")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


def test_internal_purge_expired_conversations_removes_expired_messages() -> None:
    async def seed(storage: InMemoryAssistantStorage) -> None:
        await storage.ensure_conversation("expired-thread", "session-hash", None, "es-CO", -1)
        await storage.save_message("expired-thread", "user", None, {"message": "private"})

    settings = Settings(ai_operations_token="ops-token")
    storage = InMemoryAssistantStorage()
    import asyncio

    asyncio.run(seed(storage))
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            client.app.state.storage = storage
            response = client.post(
                "/v1/internal/conversations/purge-expired",
                headers={"x-aether-operations-token": "ops-token"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["deleted"] == 1
    assert "expired-thread" not in storage.messages


def test_conversation_read_requires_owner_session() -> None:
    async def seed(storage: InMemoryAssistantStorage) -> None:
        await storage.ensure_conversation("11111111-1111-4111-8111-111111111111", stable_hash("session-hash") or "anonymous", None, "es-CO", 30)
        await storage.save_message("11111111-1111-4111-8111-111111111111", "assistant", None, {"message": "private"})

    storage = InMemoryAssistantStorage()
    import asyncio

    asyncio.run(seed(storage))
    settings = Settings(aether_cart_token_secret="shared-secret")
    owner_token = _sign_cart_token("shared-secret", {"cartId": "session-hash", "exp": int(time.time()) + 60})
    try:
        app.dependency_overrides[get_settings] = lambda: settings
        with TestClient(app) as client:
            client.app.state.storage = storage
            allowed = client.get(
                "/v1/assistant/conversations/11111111-1111-4111-8111-111111111111",
                headers={"x-aether-session-id": "session-hash", "x-aether-cart-token": owner_token},
            )
            forbidden_wrong_session = client.get(
                "/v1/assistant/conversations/11111111-1111-4111-8111-111111111111",
                headers={"x-aether-session-id": "other-session", "x-aether-cart-token": owner_token},
            )
            forbidden_no_token = client.get(
                "/v1/assistant/conversations/11111111-1111-4111-8111-111111111111",
                headers={"x-aether-session-id": "session-hash"},
            )
    finally:
        app.dependency_overrides.clear()

    assert allowed.status_code == 200
    assert len(allowed.json()["messages"]) == 1
    assert forbidden_wrong_session.status_code == 403
    # Regression check: a bare session-id header claiming ownership, with no
    # signed proof, must not be enough to read someone else's conversation.
    assert forbidden_no_token.status_code == 403


def test_conversation_delete_requires_owner_session() -> None:
    async def seed(storage: InMemoryAssistantStorage) -> None:
        await storage.ensure_conversation("22222222-2222-4222-8222-222222222222", stable_hash("session-hash") or "anonymous", None, "es-CO", 30)
        await storage.save_message("22222222-2222-4222-8222-222222222222", "assistant", None, {"message": "private"})

    storage = InMemoryAssistantStorage()
    import asyncio

    asyncio.run(seed(storage))
    settings = Settings(aether_cart_token_secret="shared-secret")
    owner_token = _sign_cart_token("shared-secret", {"cartId": "session-hash", "exp": int(time.time()) + 60})
    try:
        app.dependency_overrides[get_settings] = lambda: settings
        with TestClient(app) as client:
            client.app.state.storage = storage
            forbidden_no_token = client.delete(
                "/v1/assistant/conversations/22222222-2222-4222-8222-222222222222",
                headers={"x-aether-session-id": "session-hash"},
            )
            forbidden_wrong_session = client.delete(
                "/v1/assistant/conversations/22222222-2222-4222-8222-222222222222",
                headers={"x-aether-session-id": "other-session", "x-aether-cart-token": owner_token},
            )
            allowed = client.delete(
                "/v1/assistant/conversations/22222222-2222-4222-8222-222222222222",
                headers={"x-aether-session-id": "session-hash", "x-aether-cart-token": owner_token},
            )
    finally:
        app.dependency_overrides.clear()

    # Regression check: a bare session-id header claiming ownership, with no
    # signed proof, must not be enough to delete someone else's conversation.
    assert forbidden_no_token.status_code == 403
    assert forbidden_wrong_session.status_code == 403
    assert allowed.status_code == 200
    assert "22222222-2222-4222-8222-222222222222" not in storage.messages


def test_rate_limit_identities_use_validated_user_for_principal_scope() -> None:
    request = Request({"type": "http", "method": "POST", "path": "/", "headers": [], "client": ("127.0.0.1", 1234)})
    identities = rate_limit_identities(request, "session-1", "user_123")

    principal = identities[-1]
    assert principal[1] is True
    assert principal[2] == "authenticated_day_limit"


def test_rate_limit_identities_fallback_to_anonymous_without_validated_user() -> None:
    request = Request({"type": "http", "method": "POST", "path": "/", "headers": [], "client": ("127.0.0.1", 1234)})
    identities = rate_limit_identities(request, "session-1", None)

    principal = identities[-1]
    assert principal[1] is False
    assert principal[2] == "anonymous_day_limit"


def test_rate_limit_identities_include_conversation_scope_when_thread_exists() -> None:
    request = Request({"type": "http", "method": "POST", "path": "/", "headers": [], "client": ("127.0.0.1", 1234)})
    identities = rate_limit_identities(request, "session-1", None, "thread-1")

    reasons = [identity[2] for identity in identities]
    assert "conversation_limit" in reasons
    assert reasons[-1] == "anonymous_day_limit"
