import os
from typing import Any

import asgi
from workers import WorkerEntrypoint


ENV_KEYS = [
    "AETHER_API_BASE_URL",
    "AETHER_CART_TOKEN_SECRET",
    "AI_ASSISTANT_ENABLED",
    "AI_CATALOG_CACHE_TTL_SECONDS",
    "AI_CONVERSATION_RETENTION_DAYS",
    "AI_CORS_ALLOWED_ORIGINS",
    "AI_DAILY_REQUEST_BUDGET",
    "AI_DEPLOYMENT_ENVIRONMENT",
    "AI_INTERNAL_CIRCUIT_FAILURE_THRESHOLD",
    "AI_INTERNAL_CIRCUIT_RESET_SECONDS",
    "AI_INTERNAL_HTTP_RETRIES",
    "AI_LOG_MESSAGE_CONTENT",
    "AI_MAX_CONCURRENT_REQUESTS",
    "AI_MAX_CONVERSATION_MESSAGES",
    "AI_MAX_GRAPH_STEPS",
    "AI_MAX_INPUT_CHARACTERS",
    "AI_MAX_LLM_CALLS_PER_REQUEST",
    "AI_MAX_PRODUCTS_PER_RESPONSE",
    "AI_MAX_TOOL_CALLS_PER_REQUEST",
    "AI_MUTATION_CONFIDENCE_THRESHOLD",
    "AI_MUTATIONS_ENABLED",
    "AI_OPERATIONS_TOKEN",
    "AI_RATE_LIMIT_ANONYMOUS_PER_DAY",
    "AI_RATE_LIMIT_AUTHENTICATED_PER_DAY",
    "AI_RATE_LIMIT_MESSAGES_PER_HOUR",
    "AI_RATE_LIMIT_MESSAGES_PER_MINUTE",
    "AI_REDACT_PII",
    "AI_REQUEST_TIMEOUT_SECONDS",
    "AI_RUN_MIGRATIONS_ON_STARTUP",
    "AI_STORE_CONVERSATIONS",
    "DATABASE_URL",
    "GEMINI_API_KEY",
    "GEMINI_FALLBACK_MODEL",
    "GEMINI_MAX_OUTPUT_TOKENS",
    "GEMINI_MODEL",
    "GEMINI_TEMPERATURE",
    "OTEL_ENABLED",
    "OTEL_SERVICE_NAME",
    "REDIS_URL",
]


def sync_worker_env(env: Any) -> None:
    for key in ENV_KEYS:
        try:
            value = getattr(env, key)
        except Exception:
            value = None
        if value is not None:
            os.environ[key] = str(value)


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        sync_worker_env(self.env)
        from app.main import app

        return await asgi.fetch(app, request, self.env)
