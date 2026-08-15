import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { AppBindings } from "../types";
import { requestId } from "./request-id";

type WhoAmIBody = { requestId: string; traceId: string | null };

function buildApp() {
  const app = new Hono<AppBindings>();
  app.use("*", requestId());
  app.get("/whoami", (c) => c.json({ requestId: c.get("requestId"), traceId: c.get("traceId") ?? null }));
  return app;
}

describe("requestId middleware", () => {
  it("generates a fresh UUID and echoes it in the response header when no x-request-id is sent", async () => {
    const app = buildApp();
    const res = await app.request("/whoami");
    const body: WhoAmIBody = await res.json();

    expect(res.headers.get("x-request-id")).toBe(body.requestId);
    expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("honors a well-formed incoming x-request-id instead of generating a new one", async () => {
    const app = buildApp();
    const res = await app.request("/whoami", { headers: { "x-request-id": "client-supplied-id-123" } });
    const body: WhoAmIBody = await res.json();

    expect(body.requestId).toBe("client-supplied-id-123");
    expect(res.headers.get("x-request-id")).toBe("client-supplied-id-123");
  });

  it("rejects a malformed incoming x-request-id (too short) and generates a fresh one instead", async () => {
    const app = buildApp();
    const res = await app.request("/whoami", { headers: { "x-request-id": "short" } });
    const body: WhoAmIBody = await res.json();

    expect(body.requestId).not.toBe("short");
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("rejects an incoming x-request-id containing characters outside the allowed set", async () => {
    const app = buildApp();
    const res = await app.request("/whoami", { headers: { "x-request-id": "not a valid id; drop table" } });
    const body: WhoAmIBody = await res.json();

    expect(body.requestId).not.toContain(" ");
    expect(body.requestId).not.toContain(";");
  });

  it("rejects an incoming x-request-id longer than 80 characters", async () => {
    const app = buildApp();
    const tooLong = "a".repeat(81);
    const res = await app.request("/whoami", { headers: { "x-request-id": tooLong } });
    const body: WhoAmIBody = await res.json();

    expect(body.requestId).not.toBe(tooLong);
  });

  it("captures cf-ray as a separate traceId without using it as the requestId", async () => {
    const app = buildApp();
    const res = await app.request("/whoami", { headers: { "cf-ray": "abcdef1234567890-IAD" } });
    const body: WhoAmIBody = await res.json();

    expect(body.traceId).toBe("abcdef1234567890-IAD");
    expect(body.requestId).not.toBe("abcdef1234567890-IAD");
  });

  it("leaves traceId unset when no cf-ray header is present", async () => {
    const app = buildApp();
    const res = await app.request("/whoami");
    const body: WhoAmIBody = await res.json();

    expect(body.traceId).toBeNull();
  });
});
