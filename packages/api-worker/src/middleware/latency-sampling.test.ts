import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppBindings } from "../types";
import { latencySampling } from "./latency-sampling";

const { recordLatencySampleMock } = vi.hoisted(() => ({
  recordLatencySampleMock: vi.fn<(env: unknown, routeClass: string, durationMs: number, sampleRate: number) => Promise<void>>(() => Promise.resolve())
}));
vi.mock("../services/metrics", () => ({ recordLatencySample: recordLatencySampleMock }));

function buildApp() {
  const app = new Hono<AppBindings>();
  app.use("*", latencySampling("admin"));
  app.get("/slow", async (c) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return c.json({ ok: true });
  });
  return app;
}

const ctx = { waitUntil: (p: Promise<unknown>) => p, passThroughOnException: () => {} } as unknown as ExecutionContext;

describe("latencySampling", () => {
  it("records a sample tagged with the given route class after the response completes", async () => {
    recordLatencySampleMock.mockClear();
    const app = buildApp();

    const res = await app.request("/slow", {}, { PERFORMANCE_SAMPLE_RATE: "1" }, ctx);
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the waitUntil'd promise settle

    expect(res.status).toBe(200);
    expect(recordLatencySampleMock).toHaveBeenCalledTimes(1);
    const [, routeClass, durationMs, sampleRate] = recordLatencySampleMock.mock.calls[0]!;
    expect(routeClass).toBe("admin");
    expect(typeof durationMs).toBe("number");
    expect(durationMs).toBeGreaterThanOrEqual(0);
    expect(sampleRate).toBe(1);
  });

  it("defaults to a 5% sample rate when PERFORMANCE_SAMPLE_RATE isn't set", async () => {
    recordLatencySampleMock.mockClear();
    const app = buildApp();

    await app.request("/slow", {}, {}, ctx);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const [, , , sampleRate] = recordLatencySampleMock.mock.calls[0]!;
    expect(sampleRate).toBe(0.05);
  });

  it("never delays the response itself - the metric write happens after the response is already returned", async () => {
    recordLatencySampleMock.mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 50)));
    const app = buildApp();

    const start = Date.now();
    const res = await app.request("/slow", {}, { PERFORMANCE_SAMPLE_RATE: "1" }, ctx);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    // The response itself only waited on the ~5ms handler delay, not the
    // 50ms metrics write (proven by staying well under it here).
    expect(elapsed).toBeLessThan(50);
  });
});
