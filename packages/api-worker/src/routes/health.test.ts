import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppBindings } from "../types";
import { healthRoutes } from "./health";

function buildApp() {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    c.set("requestId", "req_test");
    await next();
  });
  app.route("/health", healthRoutes);
  return app;
}

describe("GET /health/live", () => {
  it("returns ok without touching the database", async () => {
    const app = buildApp();
    const db = { prepare: vi.fn() };
    const res = await app.request("/health/live", {}, { DB: db });
    const body = await res.json<{ success: boolean; data: { status: string; timestamp: string } }>();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("ok");
    expect(typeof body.data.timestamp).toBe("string");
    expect(db.prepare).not.toHaveBeenCalled();
  });
});

describe("GET /health/ready", () => {
  it("returns ok and only the minimal public shape when D1 responds", async () => {
    const db = { prepare: vi.fn(() => ({ first: vi.fn(() => Promise.resolve({ ok: 1 })) })) };
    const app = buildApp();

    const res = await app.request("/health/ready", {}, { DB: db });
    const body = await res.json<{ success: boolean; data: { status: string; timestamp: string } }>();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("ok");
    expect(typeof body.data.timestamp).toBe("string");
    // Never leaks internal check names/environment - see GET /admin/system-health for that.
    expect(body.data).not.toHaveProperty("checks");
    expect(body.data).not.toHaveProperty("environment");
  });

  it("returns 503 when D1 is unreachable, without exposing why", async () => {
    const db = { prepare: vi.fn(() => ({ first: vi.fn(() => Promise.reject(new Error("D1 unavailable"))) })) };
    const app = buildApp();

    const res = await app.request("/health/ready", {}, { DB: db });
    const body = await res.json<{ success: boolean; error: { code: string; message: string } }>();

    expect(res.status).toBe(503);
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("D1 unavailable");
  });
});
