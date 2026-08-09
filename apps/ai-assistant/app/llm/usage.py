from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0


def extract_token_usage(raw: Any) -> TokenUsage:
    metadata_candidates: list[Any] = []
    for attr in ["usage_metadata", "response_metadata", "metadata"]:
        value = getattr(raw, attr, None)
        if value:
            metadata_candidates.append(value)
    if isinstance(raw, dict):
        metadata_candidates.append(raw)

    input_tokens = 0
    output_tokens = 0
    for metadata in metadata_candidates:
        if not isinstance(metadata, dict):
            continue
        usage = metadata.get("usage_metadata") if isinstance(metadata.get("usage_metadata"), dict) else metadata
        token_usage = metadata.get("token_usage") if isinstance(metadata.get("token_usage"), dict) else {}
        response_usage = metadata.get("usage") if isinstance(metadata.get("usage"), dict) else {}

        input_tokens = max(
            input_tokens,
            _int_value(
                usage,
                "input_tokens",
                "prompt_token_count",
                "prompt_tokens",
            ),
            _int_value(token_usage, "prompt_tokens", "input_tokens"),
            _int_value(response_usage, "prompt_tokens", "input_tokens"),
        )
        output_tokens = max(
            output_tokens,
            _int_value(
                usage,
                "output_tokens",
                "candidates_token_count",
                "completion_tokens",
            ),
            _int_value(token_usage, "completion_tokens", "output_tokens"),
            _int_value(response_usage, "completion_tokens", "output_tokens"),
        )

    return TokenUsage(input_tokens=input_tokens, output_tokens=output_tokens)


def _int_value(mapping: dict[str, Any], *keys: str) -> int:
    for key in keys:
        value = mapping.get(key)
        if isinstance(value, int):
            return max(0, value)
        if isinstance(value, float):
            return max(0, int(value))
    return 0
