from typing import Protocol

from app.schemas import IntentResult
from app.llm.usage import TokenUsage, extract_token_usage


class StructuredChatModel(Protocol):
    def with_structured_output(self, schema: type, include_raw: bool = False) -> object:
        ...


CLASSIFIER_PROMPT = """Classify the user's Aether store assistant request.

Return only the structured schema. Do not execute actions.

Safety rules:
- Payment requests are CHECKOUT_REQUEST, never a direct payment action.
- Cart mutations require explicit verbs such as add, remove, update or clear.
- If the request is ambiguous, use UNSUPPORTED or GENERAL_STORE_QUESTION with low confidence.
"""


async def classify_intent_with_llm(model: StructuredChatModel, message: str) -> tuple[IntentResult, TokenUsage]:
    try:
        structured = model.with_structured_output(IntentResult, include_raw=True)
    except TypeError:
        structured = model.with_structured_output(IntentResult)
    result = await structured.ainvoke(
        [
            ("system", CLASSIFIER_PROMPT),
            ("human", message),
        ]
    )
    usage = extract_token_usage(result)
    if isinstance(result, dict) and "parsed" in result:
        parsed = result["parsed"]
        raw_usage = extract_token_usage(result.get("raw"))
        usage = TokenUsage(
            input_tokens=max(usage.input_tokens, raw_usage.input_tokens),
            output_tokens=max(usage.output_tokens, raw_usage.output_tokens),
        )
        if isinstance(parsed, IntentResult):
            return parsed, usage
        return IntentResult.model_validate(parsed), usage
    if isinstance(result, IntentResult):
        return result, usage
    return IntentResult.model_validate(result), usage
