import asyncio
from pathlib import Path

import app.evaluation as local_evaluation
import app.gemini_evaluation as gemini_evaluation
from app.config import Settings
from app.evaluation import _pii_redaction_matches, evaluate_cases, load_cases
from app.schemas import IntentResult
from app.gemini_evaluation import evaluate_cases_with_gemini, resolve_limit


DATASET = Path(__file__).resolve().parents[1] / "evaluation" / "cases.jsonl"


def test_evaluation_dataset_has_required_size() -> None:
    cases = load_cases(DATASET)
    assert len(cases) >= 100


def test_evaluation_runner_reports_metrics() -> None:
    result = evaluate_cases(DATASET)
    assert result.total >= 100
    assert result.intent_matches > 0
    assert result.price_filter_matches > 0
    assert result.quantity_matches > 0
    assert result.intent_accuracy >= 0.95
    assert result.tool_selection_accuracy >= 0.95
    assert result.tool_argument_accuracy >= 0.95
    assert result.cart_mutation_success_rate >= 0.95
    assert result.unauthorized_mutation_rate == 0
    assert result.hallucinated_product_rate == 0
    assert result.duplicate_mutation_rate == 0
    assert result.cross_user_data_leakage_rate == 0
    assert result.latency_p95_ms >= 0
    assert result.estimated_input_characters > 0
    assert result.estimated_llm_calls == 0


def test_evaluation_pii_redaction_metric_checks_actual_input() -> None:
    assert _pii_redaction_matches(
        "Compra todo con esta tarjeta 4111111111111111",
        {"must_redact_card": True},
    )

    original_redact = local_evaluation.redact_pii
    local_evaluation.redact_pii = lambda value: value
    try:
        assert not _pii_redaction_matches(
            "Compra todo con esta tarjeta 4111111111111111",
            {"must_redact_card": True},
        )
    finally:
        local_evaluation.redact_pii = original_redact


def test_gemini_evaluation_limit_defaults_to_safe_size() -> None:
    assert resolve_limit(None, None) == 10


def test_gemini_evaluation_limit_caps_large_requests() -> None:
    assert resolve_limit(100, None) == 25


def test_gemini_evaluation_limit_rejects_zero() -> None:
    try:
        resolve_limit(0, None)
    except ValueError as exc:
        assert "at least 1" in str(exc)
    else:
        raise AssertionError("Expected zero limit to fail")


def test_gemini_evaluation_requires_api_key() -> None:
    settings = Settings(gemini_api_key="")
    try:
        asyncio.run(evaluate_cases_with_gemini(DATASET, settings, limit=1))
    except RuntimeError as exc:
        assert "GEMINI_API_KEY" in str(exc)
    else:
        raise AssertionError("Expected missing GEMINI_API_KEY to fail")


def test_gemini_evaluation_accepts_structured_classifier_tuple() -> None:
    class FakeModel:
        pass

    async def fake_classifier(model, message):
        return (
            IntentResult(intent="SEARCH_PRODUCTS", confidence=0.95, explanation="fake"),
            object(),
        )

    original_create = gemini_evaluation.create_chat_model
    original_classifier = gemini_evaluation.classify_intent_with_llm
    gemini_evaluation.create_chat_model = lambda settings: FakeModel()
    gemini_evaluation.classify_intent_with_llm = fake_classifier
    try:
        result = asyncio.run(
            gemini_evaluation.evaluate_cases_with_gemini(
                DATASET,
                Settings(gemini_api_key="test-key"),
                limit=1,
            )
        )
    finally:
        gemini_evaluation.create_chat_model = original_create
        gemini_evaluation.classify_intent_with_llm = original_classifier

    assert result.total == 1
    assert result.failures == 0
    assert result.failure_reasons == {}


def test_gemini_evaluation_reports_safe_failure_reasons() -> None:
    class FakeModel:
        pass

    async def failing_classifier(model, message):
        raise RuntimeError("secret provider message")

    original_create = gemini_evaluation.create_chat_model
    original_classifier = gemini_evaluation.classify_intent_with_llm
    gemini_evaluation.create_chat_model = lambda settings: FakeModel()
    gemini_evaluation.classify_intent_with_llm = failing_classifier
    try:
        result = asyncio.run(
            gemini_evaluation.evaluate_cases_with_gemini(
                DATASET,
                Settings(gemini_api_key="test-key"),
                limit=1,
            )
        )
    finally:
        gemini_evaluation.create_chat_model = original_create
        gemini_evaluation.classify_intent_with_llm = original_classifier

    report = gemini_evaluation.result_to_dict(result)
    assert result.total == 1
    assert result.failures == 1
    assert result.failure_reasons == {"RuntimeError": 1}
    assert "secret provider message" not in str(report)


def test_gemini_evaluation_configures_windows_event_loop_policy() -> None:
    assert callable(gemini_evaluation.configure_event_loop_policy)


def test_gemini_evaluation_times_out_slow_provider() -> None:
    class FakeModel:
        pass

    async def slow_classifier(model, message):
        await asyncio.sleep(0.05)
        return (
            IntentResult(intent="SEARCH_PRODUCTS", confidence=0.95, explanation="slow"),
            object(),
        )

    original_create = gemini_evaluation.create_chat_model
    original_classifier = gemini_evaluation.classify_intent_with_llm
    gemini_evaluation.create_chat_model = lambda settings: FakeModel()
    gemini_evaluation.classify_intent_with_llm = slow_classifier
    settings = Settings(gemini_api_key="test-key", ai_request_timeout_seconds=1)
    object.__setattr__(settings, "ai_request_timeout_seconds", 0.01)
    try:
        result = asyncio.run(
            gemini_evaluation.evaluate_cases_with_gemini(
                DATASET,
                settings,
                limit=1,
            )
        )
    finally:
        gemini_evaluation.create_chat_model = original_create
        gemini_evaluation.classify_intent_with_llm = original_classifier

    assert result.failures == 1
    assert result.failure_reasons == {"TimeoutError": 1}
