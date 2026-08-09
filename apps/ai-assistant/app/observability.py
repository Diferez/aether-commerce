import json
import logging
import time
from collections import defaultdict
from contextlib import contextmanager
from typing import Iterator

from fastapi import FastAPI


REQUIRED_COUNTERS = [
    "ai_requests_total",
    "ai_request_errors_total",
    "ai_llm_calls_total",
    "ai_llm_tokens_input_total",
    "ai_llm_tokens_output_total",
    "ai_tool_calls_total",
    "ai_tool_errors_total",
    "ai_rate_limit_errors_total",
    "ai_cart_mutations_total",
    "ai_cart_mutation_failures_total",
    "ai_clarifications_total",
    "ai_fallback_total",
]
REQUIRED_GAUGES = [
    "ai_requests_active",
    "ai_daily_budget_usage_ratio",
    "ai_daily_budget_requests_remaining",
    "ai_daily_budget_threshold_70_reached",
    "ai_daily_budget_threshold_85_reached",
    "ai_daily_budget_threshold_95_reached",
]
REQUIRED_HISTOGRAMS = [
    "ai_request_duration_seconds",
    "ai_llm_duration_seconds",
    "ai_tool_duration_seconds",
]


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%SZ"),
        }
        for key in [
            "request_id",
            "thread_id",
            "session_hash",
            "intent",
            "confidence",
            "node",
            "tool_name",
            "duration_ms",
            "status",
            "error_code",
            "llm_call_count",
            "tool_call_count",
            "model",
        ]:
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


class MetricsRegistry:
    def __init__(self) -> None:
        self.counters: dict[str, float] = defaultdict(float)
        self.histograms: dict[str, list[float]] = defaultdict(list)
        self.gauges: dict[str, float] = defaultdict(float)
        for name in REQUIRED_COUNTERS:
            self.counters[name] = 0
        for name in REQUIRED_GAUGES:
            self.gauges[name] = 0
        for name in REQUIRED_HISTOGRAMS:
            self.histograms[name] = []

    def inc(self, name: str, value: float = 1) -> None:
        self.counters[name] += value

    def set(self, name: str, value: float) -> None:
        self.gauges[name] = value

    def add_gauge(self, name: str, value: float) -> None:
        self.gauges[name] += value

    def observe(self, name: str, value: float) -> None:
        self.histograms[name].append(value)

    @contextmanager
    def timer(self, name: str) -> Iterator[None]:
        start = time.perf_counter()
        try:
            yield
        finally:
            self.observe(name, time.perf_counter() - start)

    def render_prometheus(self) -> str:
        lines: list[str] = []
        for name, value in sorted(self.counters.items()):
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{name} {value}")
        for name, value in sorted(self.gauges.items()):
            lines.append(f"# TYPE {name} gauge")
            lines.append(f"{name} {value}")
        for name, values in sorted(self.histograms.items()):
            lines.append(f"# TYPE {name} summary")
            lines.append(f"{name}_count {len(values)}")
            lines.append(f"{name}_sum {sum(values)}")
            lines.append(f"{name}_max {max(values) if values else 0}")
        return "\n".join(lines) + "\n"


metrics = MetricsRegistry()


def configure_tracing(app: FastAPI, service_name: str, enabled: bool) -> None:
    if not enabled:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except Exception:
        logging.getLogger("aether.ai_assistant").warning("opentelemetry_unavailable")
        return

    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)
