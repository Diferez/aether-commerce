import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { DatabaseError, ValidationError } from "@aether-commerce/core";
import type { AppBindings } from "../types";
import { errorBoundary } from "./errors";

type ReportContext = { requestId?: string; traceId?: string; route?: string; method?: string; code?: string };
type ErrorBody = { success: boolean; error: { code: string; message: string; details?: unknown }; meta: { requestId: string } };

const { loggerCalls, captureExceptionMock } = vi.hoisted(() => ({
  loggerCalls: [] as Array<{ level: string; event: string; input: unknown }>,
  captureExceptionMock: vi.fn<(env: unknown, error: unknown, context: ReportContext) => void>()
}));

vi.mock("../services/observability", () => ({
  getLogger: () => ({
    debug: (event: string, input: unknown) => loggerCalls.push({ level: "debug", event, input }),
    info: (event: string, input: unknown) => loggerCalls.push({ level: "info", event, input }),
    warn: (event: string, input: unknown) => loggerCalls.push({ level: "warn", event, input }),
    error: (event: string, input: unknown) => loggerCalls.push({ level: "error", event, input })
  }),
  captureException: captureExceptionMock
}));

// incrementMetric does a real D1 write - irrelevant to what this file tests
// (error classification/logging/Sentry-gating), so it's mocked out rather
// than requiring every test to also fake a DB.
vi.mock("../services/metrics", () => ({ incrementMetric: vi.fn(() => Promise.resolve()) }));

const fakeExecutionContext = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

// errorBoundary must be registered via app.onError(), not app.use("*", ...)
// with a try/catch - Hono's compose() resolves a thrown error using the
// app's error handler at the innermost dispatch level, so a middleware-
// shaped version of this would never actually see anything thrown deeper in
// the chain. Mirrors index.ts's real registration exactly.
function buildApp(handler: () => never) {
  const app = new Hono<AppBindings>();
  app.onError(errorBoundary());
  app.use("*", async (c, next) => {
    c.set("requestId", "req_test");
    await next();
  });
  app.get("/boom", handler);
  return { request: (path: string) => app.request(path, {}, {}, fakeExecutionContext) };
}

describe("errorBoundary", () => {
  it("maps an HTTPException to its own status/message without reporting to Sentry", async () => {
    loggerCalls.length = 0;
    captureExceptionMock.mockClear();
    const app = buildApp(() => {
      throw new HTTPException(404, { message: "Not found here" });
    });

    const res = await app.request("/boom");
    const body: ErrorBody = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ success: false, error: { code: "HTTP_ERROR", message: "Not found here", details: undefined }, meta: { requestId: "req_test" } });
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(loggerCalls.some((c) => c.level === "warn")).toBe(true);
  });

  it("maps an expected AppError (ValidationError) to its status/code and never reports it to Sentry", async () => {
    loggerCalls.length = 0;
    captureExceptionMock.mockClear();
    const app = buildApp(() => {
      throw new ValidationError("email is required", { code: "EMAIL_REQUIRED" });
    });

    const res = await app.request("/boom");
    const body: ErrorBody = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toEqual({ code: "EMAIL_REQUIRED", message: "email is required", details: undefined });
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("never leaks a stack trace into the HTTP response body", async () => {
    const app = buildApp(() => {
      throw new Error("internal detail with a stack");
    });

    const res = await app.request("/boom");
    const text = await res.text();

    expect(text).not.toContain("internal detail with a stack");
    expect(text).not.toMatch(/at .*:\d+:\d+/);
  });

  it("normalizes a bare Error to a generic 500 and reports it to Sentry (unexpected + reportable by default)", async () => {
    loggerCalls.length = 0;
    captureExceptionMock.mockClear();
    const app = buildApp(() => {
      throw new Error("something broke");
    });

    const res = await app.request("/boom");
    const body: ErrorBody = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toEqual({ code: "INTERNAL_ERROR", message: "The request could not be completed.", details: undefined });
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(loggerCalls.some((c) => c.level === "error" && c.event === "application.unhandled_error")).toBe(true);
  });

  it("reports a DatabaseError to Sentry with requestId/route/method/code context", async () => {
    captureExceptionMock.mockClear();
    const app = buildApp(() => {
      throw new DatabaseError("D1 write failed", { code: "ORDER_WRITE_FAILED" });
    });

    await app.request("/boom");

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [, , context] = captureExceptionMock.mock.calls[0]!;
    expect(context).toMatchObject({ requestId: "req_test", route: "/boom", method: "GET", code: "ORDER_WRITE_FAILED" });
  });

  it("always includes the requestId in the error response meta", async () => {
    const app = buildApp(() => {
      throw new Error("boom");
    });

    const res = await app.request("/boom");
    const body: ErrorBody = await res.json();

    expect(body.meta.requestId).toBe("req_test");
  });
});
