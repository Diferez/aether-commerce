import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../types";
import { fail } from "../http";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(limit = 120, windowMs = 60_000): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "anonymous";
    const key = `${ip}:${new URL(c.req.url).pathname}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    if (bucket.count >= limit) {
      return fail(c, 429, "RATE_LIMITED", "Too many requests. Try again shortly.");
    }

    bucket.count += 1;
    await next();
  };
}
