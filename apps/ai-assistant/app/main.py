import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse

from app.cart_token import verify_cart_token
from app.clients.aether import AetherApiClient
from app.config import Settings, get_settings, parse_cors_allowed_origins
from app.graph import AssistantGraph
from app.llm.provider import create_chat_models
from app.migrate import run_migrations
from app.observability import configure_logging, configure_tracing, metrics
from app.rate_limit import (
    ConcurrencyLimitExceeded,
    InMemoryConcurrencyLimiter,
    InMemoryRateLimiter,
    RateLimitResult,
    RedisConcurrencyLimiter,
    RedisRateLimiter,
    create_concurrency_limiter,
    create_rate_limiter,
)
from app.schemas import AssistantMessageRequest, AssistantResponse
from app.security import stable_hash
from app.storage import AssistantStorage, create_storage

app = FastAPI(title="Aether AI Assistant", version="0.1.0")
logger = logging.getLogger("aether.ai_assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_allowed_origins(get_settings().ai_cors_allowed_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


def sse_event(event_name: str, payload: object) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def require_operations_token(settings: Settings, token: str | None) -> None:
    if not settings.ai_operations_token:
        raise HTTPException(status_code=404, detail="Not found")
    if token != settings.ai_operations_token:
        raise HTTPException(status_code=403, detail="Forbidden")


@app.on_event("startup")
async def startup() -> None:
    configure_logging()
    settings = get_settings()
    configure_tracing(app, settings.otel_service_name, settings.otel_enabled)
    if settings.ai_run_migrations_on_startup:
        await asyncio.to_thread(run_migrations, settings.database_url)
    app.state.storage = create_storage(settings)
    app.state.rate_limiter = create_rate_limiter(settings)
    app.state.concurrency_limiter = create_concurrency_limiter(settings)


def get_storage(request: Request) -> AssistantStorage:
    storage = getattr(request.app.state, "storage", None)
    if storage is None:
        storage = create_storage(get_settings())
        request.app.state.storage = storage
    return storage


RateLimiter = InMemoryRateLimiter | RedisRateLimiter
ConcurrencyLimiter = InMemoryConcurrencyLimiter | RedisConcurrencyLimiter


def get_rate_limiter(request: Request) -> RateLimiter:
    limiter = getattr(request.app.state, "rate_limiter", None)
    if limiter is None:
        limiter = create_rate_limiter(get_settings())
        request.app.state.rate_limiter = limiter
    return limiter


def get_concurrency_limiter(request: Request) -> ConcurrencyLimiter:
    limiter = getattr(request.app.state, "concurrency_limiter", None)
    if limiter is None:
        limiter = create_concurrency_limiter(get_settings())
        request.app.state.concurrency_limiter = limiter
    return limiter


def get_graph(
    request: Request,
    settings: Settings = Depends(get_settings),
    storage: AssistantStorage = Depends(get_storage),
) -> AssistantGraph:
    client = getattr(request.app.state, "aether_client", None)
    if client is None:
        client = AetherApiClient(
            str(settings.aether_api_base_url),
            settings.ai_request_timeout_seconds,
            max_retries=settings.ai_internal_http_retries,
            circuit_failure_threshold=settings.ai_internal_circuit_failure_threshold,
            circuit_reset_seconds=settings.ai_internal_circuit_reset_seconds,
            catalog_cache_ttl_seconds=settings.ai_catalog_cache_ttl_seconds,
        )
        request.app.state.aether_client = client
    return AssistantGraph(settings, client, storage, create_chat_models(settings))


def usage_day() -> str:
    return datetime.now(UTC).date().isoformat()


async def enforce_daily_budget(settings: Settings, storage: AssistantStorage) -> None:
    if settings.ai_daily_request_budget is None:
        return
    usage = await storage.get_daily_usage("project", usage_day())
    update_daily_budget_metrics(settings.ai_daily_request_budget, usage["request_count"])
    if usage["request_count"] >= settings.ai_daily_request_budget:
        metrics.inc("ai_rate_limit_errors_total")
        raise HTTPException(status_code=429, detail="daily_budget_exceeded")


def enforce_input_size(message: str, settings: Settings) -> None:
    if len(message) > settings.ai_max_input_characters:
        raise HTTPException(status_code=413, detail="input_too_large")


async def resolve_actor_user_id(graph: AssistantGraph, authorization: str | None) -> str | None:
    if not authorization:
        return None
    try:
        actor = await graph.aether.get_actor(authorization)
    except Exception:
        return None
    user_id = actor.get("userId") if actor else None
    return str(user_id) if user_id else None


async def authorize_conversation_access(
    storage: AssistantStorage,
    conversation_id: str,
    *,
    session_id: str,
    user_id: str | None,
    cart_token: str | None,
    cart_token_secret: str,
) -> None:
    conversation = await storage.get_conversation_metadata(conversation_id)
    if not conversation or conversation.get("status") in {"deleted", "expired"}:
        raise HTTPException(status_code=404, detail="Conversation not found")

    stored_user_hash = conversation.get("user_id")
    if stored_user_hash:
        if not user_id or stable_hash(user_id) != stored_user_hash:
            raise HTTPException(status_code=403, detail="Forbidden")
        return

    # For anonymous conversations, x-aether-session-id/x-aether-cart-id are
    # just client-supplied strings - anyone could claim someone else's cart
    # id. Require the same HMAC-signed cart token used to authorize cart
    # mutations as proof the caller actually controls that cart/session, not
    # just the bare header match below.
    if not verify_cart_token(cart_token, cart_token_secret, session_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    if conversation.get("session_hash") != (stable_hash(session_id) or "anonymous"):
        raise HTTPException(status_code=403, detail="Forbidden")


def request_ip_hash(http_request: Request) -> str:
    forwarded = http_request.headers.get("cf-connecting-ip") or http_request.headers.get("x-forwarded-for")
    ip_value = (forwarded or (http_request.client.host if http_request.client else "unknown")).split(",", 1)[0].strip()
    return stable_hash(f"ip:{ip_value}") or "ip_unknown"


def rate_limit_identities(
    http_request: Request,
    session_id: str,
    user_id: str | None = None,
    conversation_id: str | None = None,
) -> list[tuple[str, bool | None, str]]:
    authenticated = bool(user_id)
    principal = stable_hash(f"user:{user_id}") if authenticated else stable_hash(f"anonymous:{session_id}")
    day_reason = "authenticated_day_limit" if authenticated else "anonymous_day_limit"
    identities = [
        (stable_hash("project:aether-ai-assistant") or "project", None, "project_limit"),
        (request_ip_hash(http_request), None, "ip_limit"),
        (stable_hash(f"session:{session_id}") or "session_unknown", None, "session_limit"),
    ]
    if conversation_id:
        identities.append((stable_hash(f"conversation:{conversation_id}") or "conversation_unknown", None, "conversation_limit"))
    identities.append((principal or "principal_unknown", day_reason == "authenticated_day_limit", day_reason))
    return identities


async def enforce_request_rate_limits(
    limiter: RateLimiter,
    settings: Settings,
    identities: list[tuple[str, bool | None, str]],
) -> RateLimitResult:
    for identity, day_scope, day_reason in identities:
        day_limit: int | None
        if day_scope is True:
            day_limit = settings.ai_rate_limit_authenticated_per_day
        elif day_scope is False:
            day_limit = settings.ai_rate_limit_anonymous_per_day
        else:
            day_limit = None
        result = await limiter.check(identity, day_limit=day_limit, day_reason=day_reason)
        if not result.allowed:
            return result
    return RateLimitResult(True)


async def record_request_usage(
    storage: AssistantStorage,
    graph: AssistantGraph | None = None,
    *,
    request_count: int = 0,
    settings: Settings | None = None,
) -> None:
    await storage.increment_daily_usage(
        "project",
        usage_day(),
        request_count=request_count,
        llm_calls=getattr(graph, "last_llm_call_count", 0) if graph is not None else 0,
        tool_calls=getattr(graph, "last_tool_call_count", 0) if graph is not None else 0,
    )
    if settings and settings.ai_daily_request_budget is not None:
        usage = await storage.get_daily_usage("project", usage_day())
        update_daily_budget_metrics(settings.ai_daily_request_budget, usage["request_count"])


def update_daily_budget_metrics(budget: int, request_count: int) -> None:
    if budget <= 0:
        return
    ratio = min(1.0, request_count / budget)
    metrics.set("ai_daily_budget_usage_ratio", ratio)
    metrics.set("ai_daily_budget_requests_remaining", max(0, budget - request_count))
    metrics.set("ai_daily_budget_threshold_70_reached", 1 if ratio >= 0.70 else 0)
    metrics.set("ai_daily_budget_threshold_85_reached", 1 if ratio >= 0.85 else 0)
    metrics.set("ai_daily_budget_threshold_95_reached", 1 if ratio >= 0.95 else 0)


def production_readiness_issues(settings: Settings) -> list[str]:
    if settings.ai_deployment_environment.lower() != "production" or not settings.ai_assistant_enabled:
        return []

    issues: list[str] = []
    if not settings.gemini_api_key:
        issues.append("gemini_api_key_missing")
    if not settings.aether_cart_token_secret:
        issues.append("aether_cart_token_secret_missing")
    if not settings.database_url.startswith(("postgresql://", "postgres://")):
        issues.append("postgres_database_url_required")
    if not settings.redis_url:
        issues.append("redis_url_missing")
    if settings.ai_cors_allowed_origins.strip() == "*":
        issues.append("cors_origins_must_be_explicit")
    return issues


async def run_graph_with_timeout(
    graph: AssistantGraph,
    request: AssistantMessageRequest,
    *,
    cart_id: str | None,
    session_id: str,
    cart_token: str | None,
    user_id: str | None,
    settings: Settings,
) -> AssistantResponse:
    try:
        return await asyncio.wait_for(
            graph.run(
                request,
                cart_id=cart_id,
                session_id=session_id,
                cart_token=cart_token,
                user_id=user_id,
            ),
            timeout=settings.ai_request_timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        metrics.inc("ai_request_errors_total")
        raise HTTPException(status_code=504, detail="assistant_timeout") from exc


@app.middleware("http")
async def request_metrics(request: Request, call_next):
    start = time.perf_counter()
    metrics.add_gauge("ai_requests_active", 1)
    try:
        response = await call_next(request)
        metrics.inc("ai_requests_total")
        metrics.observe("ai_request_duration_seconds", time.perf_counter() - start)
        logger.info(
            "assistant_http_request",
            extra={
                "duration_ms": round((time.perf_counter() - start) * 1000, 2),
                "status": response.status_code,
            },
        )
        return response
    except Exception:
        metrics.inc("ai_requests_total")
        metrics.inc("ai_request_errors_total")
        metrics.observe("ai_request_duration_seconds", time.perf_counter() - start)
        raise
    finally:
        metrics.add_gauge("ai_requests_active", -1)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
async def readyz(settings: Settings = Depends(get_settings)) -> dict[str, object]:
    issues = production_readiness_issues(settings)
    status = "disabled" if not settings.ai_assistant_enabled else "not_ready" if issues else "ready"
    return {
        "status": status,
        "gemini_configured": bool(settings.gemini_api_key),
        "production_ready": not issues,
        "readiness_issues": issues,
        "aether_api_base_url": str(settings.aether_api_base_url),
    }


@app.get("/metrics")
async def metrics_endpoint() -> PlainTextResponse:
    return PlainTextResponse(metrics.render_prometheus(), media_type="text/plain; version=0.0.4")


@app.post("/v1/assistant/messages", response_model=AssistantResponse)
async def create_message(
    request: AssistantMessageRequest,
    response: Response,
    http_request: Request,
    settings: Settings = Depends(get_settings),
    graph: AssistantGraph = Depends(get_graph),
    limiter: RateLimiter = Depends(get_rate_limiter),
    concurrency: ConcurrencyLimiter = Depends(get_concurrency_limiter),
    authorization: str | None = Header(default=None),
    x_aether_cart_id: str | None = Header(default=None),
    x_aether_cart_token: str | None = Header(default=None),
    x_aether_session_id: str | None = Header(default=None),
) -> AssistantResponse:
    enforce_input_size(request.message, settings)
    session_id = x_aether_session_id or x_aether_cart_id or "anonymous"
    user_id = await resolve_actor_user_id(graph, authorization)
    rate = await enforce_request_rate_limits(
        limiter,
        settings,
        rate_limit_identities(http_request, session_id, user_id, str(request.thread_id) if request.thread_id else None),
    )
    if not rate.allowed:
        metrics.inc("ai_rate_limit_errors_total")
        response.headers["Retry-After"] = str(rate.retry_after_seconds)
        raise HTTPException(status_code=429, detail=rate.reason or "rate_limited")
    await enforce_daily_budget(settings, graph.storage)
    await record_request_usage(graph.storage, request_count=1, settings=settings)
    try:
        async with concurrency.slot():
            result = await run_graph_with_timeout(
                graph,
                request,
                cart_id=x_aether_cart_id,
                session_id=session_id,
                cart_token=x_aether_cart_token,
                user_id=user_id,
                settings=settings,
            )
    except ConcurrencyLimitExceeded as exc:
        metrics.inc("ai_rate_limit_errors_total")
        raise HTTPException(status_code=429, detail="concurrency_limit", headers={"Retry-After": "10"}) from exc
    await record_request_usage(graph.storage, graph, settings=settings)
    metrics.inc("ai_llm_calls_total", getattr(graph, "last_llm_call_count", 0))
    metrics.inc("ai_tool_calls_total", getattr(graph, "last_tool_call_count", 0))
    if result.action.type.startswith("CART_"):
        metrics.inc("ai_cart_mutations_total")
    if result.action.type == "ASK_CLARIFICATION":
        metrics.inc("ai_clarifications_total")
    return result


@app.post("/v1/assistant/messages/stream")
async def stream_message(
    request: AssistantMessageRequest,
    http_request: Request,
    settings: Settings = Depends(get_settings),
    graph: AssistantGraph = Depends(get_graph),
    limiter: RateLimiter = Depends(get_rate_limiter),
    concurrency: ConcurrencyLimiter = Depends(get_concurrency_limiter),
    authorization: str | None = Header(default=None),
    x_aether_cart_id: str | None = Header(default=None),
    x_aether_cart_token: str | None = Header(default=None),
    x_aether_session_id: str | None = Header(default=None),
) -> StreamingResponse:
    async def events() -> AsyncIterator[str]:
        spanish = request.locale.lower().startswith("es")
        status_message = "Buscando productos" if spanish else "Searching products"
        yield sse_event("assistant.started", {})
        yield sse_event("assistant.status", {"message": status_message})
        try:
            enforce_input_size(request.message, settings)
            session_id = x_aether_session_id or x_aether_cart_id or "anonymous"
            user_id = await resolve_actor_user_id(graph, authorization)
            rate = await enforce_request_rate_limits(
                limiter,
                settings,
                rate_limit_identities(http_request, session_id, user_id, str(request.thread_id) if request.thread_id else None),
            )
            if not rate.allowed:
                metrics.inc("ai_rate_limit_errors_total")
                yield f"event: assistant.error\ndata: {{\"message\":\"rate_limited\",\"retry_after_seconds\":{rate.retry_after_seconds}}}\n\n"
                return
            await enforce_daily_budget(settings, graph.storage)
            await record_request_usage(graph.storage, request_count=1, settings=settings)
            try:
                async with concurrency.slot():
                    response = await run_graph_with_timeout(
                        graph,
                        request,
                        cart_id=x_aether_cart_id,
                        session_id=session_id,
                        cart_token=x_aether_cart_token,
                        user_id=user_id,
                        settings=settings,
                    )
            except ConcurrencyLimitExceeded:
                metrics.inc("ai_rate_limit_errors_total")
                yield "event: assistant.error\ndata: {\"message\":\"concurrency_limit\",\"retry_after_seconds\":10}\n\n"
                return
            await record_request_usage(graph.storage, graph, settings=settings)
            metrics.inc("ai_llm_calls_total", getattr(graph, "last_llm_call_count", 0))
            metrics.inc("ai_tool_calls_total", getattr(graph, "last_tool_call_count", 0))
            if response.products:
                yield sse_event("assistant.products", [item.model_dump(mode="json") for item in response.products])
            if response.cart and response.action.type.startswith("CART_"):
                yield sse_event("assistant.cart_updated", response.cart.model_dump(mode="json"))
            if response.action.type == "ASK_CLARIFICATION":
                yield sse_event("assistant.clarification", {"message": response.message})
            yield sse_event("assistant.token", {"text": response.message})
            yield sse_event("assistant.completed", response.model_dump(mode="json"))
        except Exception:
            message = "El asistente esta temporalmente ocupado." if request.locale.lower().startswith("es") else "The assistant is temporarily busy."
            yield sse_event("assistant.error", {"message": message})

    return StreamingResponse(events(), media_type="text/event-stream")


@app.get("/v1/assistant/conversations/{thread_id}")
async def get_conversation(
    thread_id: UUID,
    storage: AssistantStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
    graph: AssistantGraph = Depends(get_graph),
    authorization: str | None = Header(default=None),
    x_aether_cart_id: str | None = Header(default=None),
    x_aether_session_id: str | None = Header(default=None),
    x_aether_cart_token: str | None = Header(default=None),
) -> dict[str, object]:
    session_id = x_aether_session_id or x_aether_cart_id or "anonymous"
    user_id = await resolve_actor_user_id(graph, authorization)
    await authorize_conversation_access(
        storage,
        str(thread_id),
        session_id=session_id,
        user_id=user_id,
        cart_token=x_aether_cart_token,
        cart_token_secret=settings.aether_cart_token_secret,
    )
    messages = await storage.list_messages(str(thread_id), settings.ai_max_conversation_messages)
    return {
        "thread_id": str(thread_id),
        "messages": [
            {"role": item.role, "content_redacted": item.content_redacted, "payload": item.payload}
            for item in messages
        ],
    }


@app.delete("/v1/assistant/conversations/{thread_id}")
async def delete_conversation(
    thread_id: UUID,
    storage: AssistantStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
    graph: AssistantGraph = Depends(get_graph),
    authorization: str | None = Header(default=None),
    x_aether_cart_id: str | None = Header(default=None),
    x_aether_session_id: str | None = Header(default=None),
    x_aether_cart_token: str | None = Header(default=None),
) -> dict[str, object]:
    if not thread_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    session_id = x_aether_session_id or x_aether_cart_id or "anonymous"
    user_id = await resolve_actor_user_id(graph, authorization)
    await authorize_conversation_access(
        storage,
        str(thread_id),
        session_id=session_id,
        user_id=user_id,
        cart_token=x_aether_cart_token,
        cart_token_secret=settings.aether_cart_token_secret,
    )
    await storage.delete_conversation(str(thread_id))
    return {"thread_id": str(thread_id), "deleted": True}


@app.get("/v1/internal/audit/events")
async def list_audit_events(
    storage: AssistantStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
    x_aether_operations_token: str | None = Header(default=None),
    thread_id: str | None = Query(default=None),
    request_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict[str, object]:
    require_operations_token(settings, x_aether_operations_token)
    if not thread_id and not request_id:
        raise HTTPException(status_code=400, detail="thread_id or request_id is required")
    events = await storage.list_audit_events(thread_id=thread_id, request_id=request_id, limit=limit)
    return {"events": events, "count": len(events)}


@app.delete("/v1/internal/conversations/user/{user_hash}")
async def delete_user_conversations(
    user_hash: str,
    storage: AssistantStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
    x_aether_operations_token: str | None = Header(default=None),
) -> dict[str, object]:
    require_operations_token(settings, x_aether_operations_token)
    if len(user_hash) < 12:
        raise HTTPException(status_code=400, detail="user_hash is invalid")
    deleted = await storage.delete_conversations_by_user_hash(user_hash)
    return {"user_hash": user_hash, "deleted": deleted}


@app.post("/v1/internal/conversations/purge-expired")
async def purge_expired_conversations(
    storage: AssistantStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
    x_aether_operations_token: str | None = Header(default=None),
) -> dict[str, object]:
    require_operations_token(settings, x_aether_operations_token)
    deleted = await storage.purge_expired_conversations(datetime.now(UTC).isoformat())
    return {"deleted": deleted}
