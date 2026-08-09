from pathlib import Path


OPENAPI_PATH = Path(__file__).resolve().parents[3] / "docs" / "ai-assistant" / "openapi.yaml"


def test_ai_assistant_openapi_documents_required_endpoints() -> None:
    spec = OPENAPI_PATH.read_text(encoding="utf-8")
    for endpoint in [
        "/healthz",
        "/readyz",
        "/metrics",
        "/v1/assistant/messages",
        "/v1/assistant/messages/stream",
        "/v1/assistant/conversations/{thread_id}",
        "/v1/internal/audit/events",
        "/v1/internal/conversations/user/{user_hash}",
        "/v1/internal/conversations/purge-expired",
    ]:
        assert endpoint in spec


def test_ai_assistant_openapi_documents_structured_response_contract() -> None:
    spec = OPENAPI_PATH.read_text(encoding="utf-8")
    for schema in [
        "AssistantMessageRequest",
        "AssistantResponse",
        "ProductCard",
        "ProductVariant",
        "CartSummary",
        "AssistantAction",
        "ClientContext",
    ]:
        assert schema in spec
    for product_field in ["variant_id", "image_url", "available", "color", "size", "rating"]:
        assert product_field in spec
    for action in [
        "PRODUCTS_LISTED",
        "CART_ITEM_ADDED",
        "CART_ITEM_UPDATED",
        "CART_ITEM_REMOVED",
        "CART_CLEARED",
        "ASK_CLARIFICATION",
    ]:
        assert action in spec


def test_ai_assistant_openapi_documents_sse_and_security_headers() -> None:
    spec = OPENAPI_PATH.read_text(encoding="utf-8")
    for event_name in [
        "assistant.started",
        "assistant.status",
        "assistant.token",
        "assistant.products",
        "assistant.cart_updated",
        "assistant.clarification",
        "assistant.completed",
        "assistant.error",
    ]:
        assert event_name in spec
    for header in ["x-aether-cart-id", "x-aether-cart-token", "x-aether-session-id", "x-aether-operations-token"]:
        assert header in spec
    assert "concurrency limit" in spec.lower()
    assert "Retry-After" in spec
