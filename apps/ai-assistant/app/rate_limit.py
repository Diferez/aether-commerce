import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from collections import defaultdict, deque
from dataclasses import dataclass

from app.config import Settings


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after_seconds: int = 0
    reason: str | None = None


class ConcurrencyLimitExceeded(RuntimeError):
    pass


class InMemoryConcurrencyLimiter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.active = 0

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[None]:
        limit = max(1, self.settings.ai_max_concurrent_requests)
        if self.active >= limit:
            raise ConcurrencyLimitExceeded("concurrency_limit")
        self.active += 1
        try:
            yield
        finally:
            self.active = max(0, self.active - 1)


class RedisConcurrencyLimiter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        from redis.asyncio import Redis

        self.redis = Redis.from_url(settings.redis_url, decode_responses=True)
        self.key = "ai:concurrency:active"

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[None]:
        count = await self.redis.incr(self.key)
        if count == 1:
            await self.redis.expire(self.key, self.settings.ai_request_timeout_seconds + 10)
        if count > max(1, self.settings.ai_max_concurrent_requests):
            await self.redis.decr(self.key)
            raise ConcurrencyLimitExceeded("concurrency_limit")
        try:
            yield
        finally:
            await self.redis.decr(self.key)


class InMemoryRateLimiter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.minute_hits: dict[str, deque[float]] = defaultdict(deque)
        self.hour_hits: dict[str, deque[float]] = defaultdict(deque)
        self.day_hits: dict[str, deque[float]] = defaultdict(deque)

    async def check(
        self,
        identity: str,
        *,
        minute_limit: int | None = None,
        hour_limit: int | None = None,
        day_limit: int | None = None,
        day_reason: str = "day_limit",
    ) -> RateLimitResult:
        now = time.time()
        minute = self.minute_hits[identity]
        hour = self.hour_hits[identity]
        day = self.day_hits[identity]
        self._trim(minute, now - 60)
        self._trim(hour, now - 3600)
        self._trim(day, now - 86400)

        effective_minute_limit = minute_limit or self.settings.ai_rate_limit_messages_per_minute
        effective_hour_limit = hour_limit or self.settings.ai_rate_limit_messages_per_hour

        if len(minute) >= effective_minute_limit:
            return RateLimitResult(False, 60, "minute_limit")
        if len(hour) >= effective_hour_limit:
            return RateLimitResult(False, 3600, "hour_limit")
        if day_limit is not None and len(day) >= day_limit:
            return RateLimitResult(False, 86400, day_reason)

        minute.append(now)
        hour.append(now)
        day.append(now)
        return RateLimitResult(True)

    @staticmethod
    def _trim(values: deque[float], cutoff: float) -> None:
        while values and values[0] < cutoff:
            values.popleft()


class RedisRateLimiter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        from redis.asyncio import Redis

        self.redis = Redis.from_url(settings.redis_url, decode_responses=True)

    async def check(
        self,
        identity: str,
        *,
        minute_limit: int | None = None,
        hour_limit: int | None = None,
        day_limit: int | None = None,
        day_reason: str = "day_limit",
    ) -> RateLimitResult:
        minute_key = f"ai:rate:{identity}:minute"
        hour_key = f"ai:rate:{identity}:hour"
        day_key = f"ai:rate:{identity}:day"
        minute_count = await self.redis.incr(minute_key)
        if minute_count == 1:
            await self.redis.expire(minute_key, 60)
        hour_count = await self.redis.incr(hour_key)
        if hour_count == 1:
            await self.redis.expire(hour_key, 3600)
        day_count = await self.redis.incr(day_key)
        if day_count == 1:
            await self.redis.expire(day_key, 86400)

        effective_minute_limit = minute_limit or self.settings.ai_rate_limit_messages_per_minute
        effective_hour_limit = hour_limit or self.settings.ai_rate_limit_messages_per_hour

        if minute_count > effective_minute_limit:
            return RateLimitResult(False, 60, "minute_limit")
        if hour_count > effective_hour_limit:
            return RateLimitResult(False, 3600, "hour_limit")
        if day_limit is not None and day_count > day_limit:
            return RateLimitResult(False, 86400, day_reason)
        return RateLimitResult(True)


def create_rate_limiter(settings: Settings) -> InMemoryRateLimiter | RedisRateLimiter:
    if settings.redis_url:
        return RedisRateLimiter(settings)
    return InMemoryRateLimiter(settings)


def create_concurrency_limiter(settings: Settings) -> InMemoryConcurrencyLimiter | RedisConcurrencyLimiter:
    if settings.redis_url:
        return RedisConcurrencyLimiter(settings)
    return InMemoryConcurrencyLimiter(settings)
