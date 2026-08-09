import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import Settings
from app.evaluation import load_cases
from app.llm.intent_classifier import classify_intent_with_llm
from app.llm.provider import create_chat_model
from app.security import redact_pii


DEFAULT_LIMIT = 10


@dataclass(frozen=True)
class GeminiEvaluationResult:
    total: int
    intent_matches: int
    failures: int
    model: str
    failure_reasons: dict[str, int]

    @property
    def intent_accuracy(self) -> float:
        return self.intent_matches / self.total if self.total else 0


def default_dataset_path() -> Path:
    return Path(__file__).resolve().parents[1] / "evaluation" / "cases.jsonl"


def resolve_limit(limit: int | None, settings_limit: int | None) -> int:
    if limit is not None:
        selected = limit
    elif settings_limit:
        selected = settings_limit
    else:
        selected = DEFAULT_LIMIT
    if selected < 1:
        raise ValueError("Evaluation limit must be at least 1.")
    return min(selected, 25)


async def evaluate_cases_with_gemini(
    dataset_path: Path,
    settings: Settings,
    *,
    limit: int = DEFAULT_LIMIT,
) -> GeminiEvaluationResult:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is required for real Gemini evaluation.")

    model = create_chat_model(settings)
    if model is None:
        raise RuntimeError("Gemini model could not be created.")

    cases = load_cases(dataset_path)[:limit]
    intent_matches = 0
    failures = 0
    failure_reasons: dict[str, int] = {}

    for case in cases:
        expected = case["expected"]
        try:
            sanitized_input = redact_pii(str(case["input"]))
            result, _usage = await asyncio.wait_for(
                classify_intent_with_llm(model, sanitized_input),
                timeout=settings.ai_request_timeout_seconds,
            )
        except Exception as exc:
            failures += 1
            reason = exc.__class__.__name__
            failure_reasons[reason] = failure_reasons.get(reason, 0) + 1
            continue
        if result.intent == expected.get("intent"):
            intent_matches += 1

    return GeminiEvaluationResult(
        total=len(cases),
        intent_matches=intent_matches,
        failures=failures,
        model=settings.gemini_model,
        failure_reasons=failure_reasons,
    )


def result_to_dict(result: GeminiEvaluationResult) -> dict[str, Any]:
    return {
        "total": result.total,
        "intent_accuracy": result.intent_accuracy,
        "intent_matches": result.intent_matches,
        "failures": result.failures,
        "failure_reasons": result.failure_reasons,
        "model": result.model,
    }


def configure_event_loop_policy() -> None:
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


async def async_main() -> int:
    parser = argparse.ArgumentParser(description="Run a limited real Gemini evaluation for Aether AI Assistant.")
    parser.add_argument("--dataset", type=Path, default=default_dataset_path())
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    settings = Settings()
    try:
        limit = resolve_limit(args.limit, settings.ai_eval_max_cases)
        result = await evaluate_cases_with_gemini(args.dataset, settings, limit=limit)
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, indent=2))
        return 1

    print(json.dumps({"success": True, **result_to_dict(result)}, indent=2))
    return 0


def main() -> None:
    configure_event_loop_policy()
    raise SystemExit(asyncio.run(async_main()))


if __name__ == "__main__":
    main()
