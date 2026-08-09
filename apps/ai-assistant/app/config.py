from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    aether_api_base_url: AnyHttpUrl = Field(default="http://localhost:8787")
    ai_deployment_environment: str = "development"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_fallback_model: str = ""
    gemini_temperature: float = 0.1
    gemini_max_output_tokens: int = 600

    ai_assistant_enabled: bool = True
    ai_mutations_enabled: bool = True
    ai_intent_confidence_threshold: float = 0.75
    ai_mutation_confidence_threshold: float = 0.90
    ai_max_graph_steps: int = 12
    ai_max_llm_calls_per_request: int = 5
    ai_max_tool_calls_per_request: int = 6
    ai_max_products_per_response: int = 5
    ai_max_conversation_messages: int = 20
    ai_request_timeout_seconds: int = 25
    ai_internal_http_retries: int = 2
    ai_internal_circuit_failure_threshold: int = 3
    ai_internal_circuit_reset_seconds: int = 30
    ai_catalog_cache_ttl_seconds: int = 60
    ai_rate_limit_messages_per_minute: int = 8
    ai_rate_limit_messages_per_hour: int = 80
    ai_rate_limit_anonymous_per_day: int = 40
    ai_rate_limit_authenticated_per_day: int = 200
    ai_max_concurrent_requests: int = 20
    ai_max_input_characters: int = 4000
    ai_log_message_content: bool = False
    ai_redact_pii: bool = True
    ai_store_conversations: bool = True
    ai_conversation_retention_days: int = 30
    ai_run_migrations_on_startup: bool = False
    ai_daily_request_budget: int | None = None
    ai_eval_max_cases: int = 10
    ai_operations_token: str = ""
    ai_cors_allowed_origins: str = "*"
    otel_enabled: bool = False
    otel_service_name: str = "aether-ai-assistant"

    database_url: str = ""
    redis_url: str = ""
    aether_cart_token_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


def parse_cors_allowed_origins(value: str) -> list[str]:
    origins = [origin.strip() for origin in value.split(",") if origin.strip()]
    return origins or ["*"]
