import asyncio
import json

import httpx

from app.config import Settings
from app.graph import AssistantGraph
from app.llm.provider import build_gemini_model_configs
from app.llm.gemini_rest import GeminiRestChatModel
from app.llm.usage import extract_token_usage
from app.observability import metrics
from app.schemas import AssistantMessageRequest, IntentResult
from app.storage import InMemoryAssistantStorage


class FailingModel:
    def with_structured_output(self, schema):
        return self

    async def ainvoke(self, messages):
        raise RuntimeError("primary unavailable")


class SuccessfulModel:
    def with_structured_output(self, schema):
        return self

    async def ainvoke(self, messages):
        return IntentResult(
            intent="GENERAL_STORE_QUESTION",
            confidence=0.9,
            explanation="fallback model classified the request",
        )


class UsageRaw:
    usage_metadata = {"input_tokens": 11, "output_tokens": 7}


class UsageModel:
    def with_structured_output(self, schema, include_raw=False):
        self.include_raw = include_raw
        return self

    async def ainvoke(self, messages):
        return {
            "raw": UsageRaw(),
            "parsed": IntentResult(
                intent="GENERAL_STORE_QUESTION",
                confidence=0.9,
                explanation="usage metadata classified the request",
            ),
            "parsing_error": None,
        }


class UnusedAetherClient:
    pass


def test_build_gemini_model_configs_includes_distinct_fallback() -> None:
    settings = Settings(gemini_model="gemini-primary", gemini_fallback_model="gemini-fallback")

    configs = build_gemini_model_configs(settings)

    assert [config.model for config in configs] == ["gemini-primary", "gemini-fallback"]
    assert [config.role for config in configs] == ["primary", "fallback"]


def test_build_gemini_model_configs_omits_duplicate_fallback() -> None:
    settings = Settings(gemini_model="gemini-primary", gemini_fallback_model="gemini-primary")

    configs = build_gemini_model_configs(settings)

    assert [config.model for config in configs] == ["gemini-primary"]


def test_graph_uses_fallback_model_before_heuristic_classifier() -> None:
    async def run() -> None:
        graph = AssistantGraph(
            Settings(),
            UnusedAetherClient(),
            InMemoryAssistantStorage(),
            [FailingModel(), SuccessfulModel()],
        )

        response = await graph.run(
            AssistantMessageRequest(message="Show me whatever this fallback sees", locale="en-US", currency="USD"),
            cart_id=None,
            session_id="session-1",
        )

        assert response.intent == "GENERAL_STORE_QUESTION"
        assert graph.last_llm_call_count == 2

    asyncio.run(run())


def test_extract_token_usage_supports_langchain_and_provider_shapes() -> None:
    assert extract_token_usage(UsageRaw()).input_tokens == 11
    assert extract_token_usage(UsageRaw()).output_tokens == 7
    assert extract_token_usage({"token_usage": {"prompt_tokens": 5, "completion_tokens": 3}}).input_tokens == 5
    assert extract_token_usage({"usage": {"input_tokens": 8, "output_tokens": 4}}).output_tokens == 4


def test_graph_records_llm_token_metrics_when_provider_reports_usage() -> None:
    async def run() -> None:
        before_input = metrics.counters["ai_llm_tokens_input_total"]
        before_output = metrics.counters["ai_llm_tokens_output_total"]
        graph = AssistantGraph(
            Settings(),
            UnusedAetherClient(),
            InMemoryAssistantStorage(),
            [UsageModel()],
        )

        await graph.run(
            AssistantMessageRequest(message="Tell me about the store", locale="en-US", currency="USD"),
            cart_id=None,
            session_id="session-1",
        )

        assert metrics.counters["ai_llm_tokens_input_total"] >= before_input + 11
        assert metrics.counters["ai_llm_tokens_output_total"] >= before_output + 7

    asyncio.run(run())


def test_gemini_rest_model_parses_structured_output(monkeypatch) -> None:
    async def run() -> None:
        requests: list[dict] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(json.loads(request.content.decode("utf-8")))
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "text": json.dumps(
                                            {
                                                "intent": "SEARCH_PRODUCTS",
                                                "confidence": 0.92,
                                                "referenced_position": None,
                                                "explanation": "The user wants to find products.",
                                            }
                                        )
                                    }
                                ]
                            }
                        }
                    ],
                    "usageMetadata": {"promptTokenCount": 13, "candidatesTokenCount": 8},
                },
            )

        transport = httpx.MockTransport(handler)
        original_client = httpx.AsyncClient

        def client_factory(*args, **kwargs):
            kwargs["transport"] = transport
            return original_client(*args, **kwargs)

        monkeypatch.setattr(httpx, "AsyncClient", client_factory)
        model = GeminiRestChatModel(Settings(gemini_api_key="test-key"), "gemini-test")
        structured = model.with_structured_output(IntentResult, include_raw=True)

        result = await structured.ainvoke([("system", "Classify"), ("human", "Show me shoes")])

        assert result["parsed"].intent == "SEARCH_PRODUCTS"
        assert result["raw"].usage_metadata["prompt_token_count"] == 13
        assert requests[0]["generationConfig"]["responseMimeType"] == "application/json"

    asyncio.run(run())
