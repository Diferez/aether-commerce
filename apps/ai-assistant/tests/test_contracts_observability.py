import json
import logging

from app.clients.aether import AetherApiClient
from app.observability import JsonFormatter, MetricsRegistry


def test_product_contract_maps_cents_to_decimal_price() -> None:
    client = AetherApiClient("https://example.com")
    card = client._to_product_card(
        {
            "id": "dummyjson_1",
            "slug": "demo-product",
            "name": "Demo Product",
            "shortDescription": "A real product",
            "finalPrice": 1299,
            "availableStock": 5,
            "images": [{"url": "https://example.com/image.jpg"}],
            "variants": [{"id": "v1", "attributes": {"color": "black"}}],
            "rating": {"average": 4.5},
        }
    )
    assert str(card.price) == "12.99"
    assert card.product_url.endswith("slug=demo-product")
    assert card.available
    assert card.color == "black"


def test_cart_contract_summarizes_items() -> None:
    client = AetherApiClient("https://example.com")
    summary = client._to_cart_summary(
        {
            "items": [{"quantity": 2}, {"quantity": 1}],
            "totals": {"subtotal": 4500},
        }
    )
    assert summary.item_count == 3
    assert str(summary.subtotal) == "45"


def test_metrics_render_prometheus_text() -> None:
    registry = MetricsRegistry()
    registry.inc("ai_requests_total")
    registry.add_gauge("ai_requests_active", 1)
    registry.observe("ai_request_duration_seconds", 0.25)
    output = registry.render_prometheus()
    assert "ai_requests_total 1" in output
    assert "ai_requests_active 1" in output
    assert "ai_request_duration_seconds_count 1" in output


def test_metrics_registry_exposes_required_zero_value_metrics() -> None:
    output = MetricsRegistry().render_prometheus()
    for metric in [
        "ai_requests_total",
        "ai_requests_active",
        "ai_request_duration_seconds",
        "ai_daily_budget_usage_ratio",
        "ai_daily_budget_requests_remaining",
        "ai_daily_budget_threshold_70_reached",
        "ai_daily_budget_threshold_85_reached",
        "ai_daily_budget_threshold_95_reached",
        "ai_llm_calls_total",
        "ai_llm_duration_seconds",
        "ai_llm_tokens_input_total",
        "ai_llm_tokens_output_total",
        "ai_tool_calls_total",
        "ai_tool_errors_total",
        "ai_rate_limit_errors_total",
        "ai_cart_mutations_total",
        "ai_cart_mutation_failures_total",
        "ai_clarifications_total",
        "ai_fallback_total",
    ]:
        assert metric in output


def test_json_formatter_includes_graph_trace_fields_without_message_content() -> None:
    record = logging.LogRecord(
        "aether.ai_assistant.graph",
        logging.INFO,
        __file__,
        1,
        "assistant_graph_node",
        args=(),
        exc_info=None,
    )
    record.request_id = "request-1"
    record.thread_id = "thread-1"
    record.session_hash = "session-hash"
    record.intent = "SEARCH_PRODUCTS"
    record.confidence = 0.95
    record.node = "detect_intent"
    record.tool_name = "search_products"
    record.status = "ok"
    record.llm_call_count = 1
    record.tool_call_count = 0
    record.user_message = "do not log this"

    payload = json.loads(JsonFormatter().format(record))

    assert payload["request_id"] == "request-1"
    assert payload["thread_id"] == "thread-1"
    assert payload["session_hash"] == "session-hash"
    assert payload["intent"] == "SEARCH_PRODUCTS"
    assert payload["node"] == "detect_intent"
    assert payload["tool_name"] == "search_products"
    assert payload["llm_call_count"] == 1
    assert "user_message" not in payload
    assert "do not log this" not in json.dumps(payload)
