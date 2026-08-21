import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../types";
import { recordLatencySample } from "../services/metrics";

// Measures wall-clock duration for one route class and records it via a
// low sample rate (PERFORMANCE_SAMPLE_RATE, default 5%) - never applied to
// health checks or static routes (see index.ts's mount points: only
// /admin, /checkout, /catalog use this). Fire-and-forget so a metrics
// write never adds latency to the response it's measuring.
export function latencySampling(routeClass: string): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const durationMs = Date.now() - start;
    const sampleRate = c.env.PERFORMANCE_SAMPLE_RATE !== undefined ? Number(c.env.PERFORMANCE_SAMPLE_RATE) : 0.05;
    c.executionCtx.waitUntil(recordLatencySample(c.env, routeClass, durationMs, sampleRate).catch(() => {}));
  };
}
