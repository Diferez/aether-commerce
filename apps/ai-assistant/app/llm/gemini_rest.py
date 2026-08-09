import json
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import BaseModel

from app.config import Settings


@dataclass(frozen=True)
class GeminiRestRaw:
    usage_metadata: dict[str, int]


class GeminiRestStructuredCall:
    def __init__(self, model: "GeminiRestChatModel", schema: type[BaseModel], include_raw: bool) -> None:
        self.model = model
        self.schema = schema
        self.include_raw = include_raw

    async def ainvoke(self, messages: list[tuple[str, str]]) -> Any:
        system_text, user_text = self._split_messages(messages)
        payload = self._build_payload(system_text, user_text)
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model.model_name}:generateContent"
        )
        async with httpx.AsyncClient(timeout=self.model.timeout_seconds) as client:
            response = await client.post(url, params={"key": self.model.api_key}, json=payload)
            response.raise_for_status()
        data = response.json()
        text = self._extract_text(data)
        parsed = self.schema.model_validate_json(text)
        if not self.include_raw:
            return parsed
        usage = data.get("usageMetadata") if isinstance(data.get("usageMetadata"), dict) else {}
        return {
            "raw": GeminiRestRaw(
                usage_metadata={
                    "prompt_token_count": int(usage.get("promptTokenCount") or 0),
                    "candidates_token_count": int(usage.get("candidatesTokenCount") or 0),
                }
            ),
            "parsed": parsed,
            "parsing_error": None,
        }

    def _build_payload(self, system_text: str, user_text: str) -> dict[str, Any]:
        schema = json.dumps(self.schema.model_json_schema(), separators=(",", ":"))
        instruction = (
            f"{system_text}\n\n"
            "Return strict JSON only. The JSON must validate against this schema:\n"
            f"{schema}"
        )
        return {
            "systemInstruction": {"parts": [{"text": instruction}]},
            "contents": [{"role": "user", "parts": [{"text": user_text}]}],
            "generationConfig": {
                "temperature": self.model.temperature,
                "maxOutputTokens": self.model.max_output_tokens,
                "responseMimeType": "application/json",
            },
        }

    @staticmethod
    def _split_messages(messages: list[tuple[str, str]]) -> tuple[str, str]:
        system_parts: list[str] = []
        user_parts: list[str] = []
        for role, content in messages:
            if role == "system":
                system_parts.append(content)
            else:
                user_parts.append(content)
        return "\n".join(system_parts), "\n".join(user_parts)

    @staticmethod
    def _extract_text(data: dict[str, Any]) -> str:
        candidates = data.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise ValueError("Gemini response did not include candidates")
        content = candidates[0].get("content") if isinstance(candidates[0], dict) else None
        parts = content.get("parts") if isinstance(content, dict) else None
        if not isinstance(parts, list):
            raise ValueError("Gemini response did not include content parts")
        text_parts = [part.get("text") for part in parts if isinstance(part, dict) and isinstance(part.get("text"), str)]
        text = "".join(text_parts).strip()
        if not text:
            raise ValueError("Gemini response text was empty")
        return text


class GeminiRestChatModel:
    def __init__(self, settings: Settings, model_name: str) -> None:
        self.api_key = settings.gemini_api_key
        self.model_name = model_name
        self.temperature = settings.gemini_temperature
        self.max_output_tokens = settings.gemini_max_output_tokens
        self.timeout_seconds = settings.ai_request_timeout_seconds

    def with_structured_output(self, schema: type[BaseModel], include_raw: bool = False) -> GeminiRestStructuredCall:
        return GeminiRestStructuredCall(self, schema, include_raw)
