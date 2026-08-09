from dataclasses import dataclass
from typing import Protocol

from app.config import Settings
from app.llm.gemini_rest import GeminiRestChatModel


class StructuredChatModel(Protocol):
    def with_structured_output(self, schema: type, include_raw: bool = False) -> object:
        ...


@dataclass(frozen=True)
class GeminiModelConfig:
    model: str
    role: str


def build_gemini_model_configs(settings: Settings) -> list[GeminiModelConfig]:
    models = [GeminiModelConfig(settings.gemini_model, "primary")]
    if settings.gemini_fallback_model and settings.gemini_fallback_model != settings.gemini_model:
        models.append(GeminiModelConfig(settings.gemini_fallback_model, "fallback"))
    return models


def create_chat_models(settings: Settings) -> list[StructuredChatModel]:
    if not settings.gemini_api_key:
        return []

    return [GeminiRestChatModel(settings, config.model) for config in build_gemini_model_configs(settings)]


def create_chat_model(settings: Settings) -> StructuredChatModel | None:
    models = create_chat_models(settings)
    return models[0] if models else None
