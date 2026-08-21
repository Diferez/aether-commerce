import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import type * as ObservabilityModule from "../services/observability";
import { createApiApp } from "../index";

const worker = createApiApp();

// crypto.subtle.timingSafeEqual is a Cloudflare Workers (workerd) extension
// to WebCrypto, not part of Node's implementation - same backfill
// services/stripe.test.ts already needs for the same reason.
beforeAll(() => {
  if (typeof crypto.subtle.timingSafeEqual !== "function") {
    crypto.subtle.timingSafeEqual = (a: BufferSource, b: BufferSource) => {
      const bufA = a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      const bufB = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      if (bufA.length !== bufB.length) return false;
      let diff = 0;
      for (let i = 0; i < bufA.length; i += 1) diff |= bufA[i]! ^ bufB[i]!;
      return diff === 0;
    };
  }
});

vi.mock("../services/orders", () => ({
  createOrderFromPaidSession: vi.fn(() => Promise.resolve({ created: true, order: {} }))
}));

const { captureExceptionMock } = vi.hoisted(() => ({ captureExceptionMock: vi.fn() }));
vi.mock("../services/observability", async (importOriginal) => {
  const actual = await importOriginal<typeof ObservabilityModule>();
  return { ...actual, captureException: captureExceptionMock };
});

type QueuedResponse = { first?: unknown; all?: unknown[]; run?: { changes?: number } };

function fakeEnv(responses: QueuedResponse[] = [], overrides: Partial<Env> = {}) {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  let callIndex = 0;
  const db = {
    prepare: vi.fn((sql: string) => {
      const response = responses[callIndex] ?? {};
      callIndex += 1;
      const record = (args: unknown[]) => statements.push({ sql, args });
      return {
        // Statements with no bound params (e.g. checkout-settings' read())
        // call .first()/.all()/.run() directly on the prepared statement,
        // never through .bind() - matches real D1's D1PreparedStatement.
        first: vi.fn(() => {
          record([]);
          return Promise.resolve(response.first ?? null);
        }),
        all: vi.fn(() => {
          record([]);
          return Promise.resolve({ results: response.all ?? [] });
        }),
        run: vi.fn(() => {
          record([]);
          return Promise.resolve({ success: true, meta: { changes: response.run?.changes ?? 1 } });
        }),
        bind: vi.fn((...args: unknown[]) => {
          record(args);
          return {
            first: vi.fn(() => Promise.resolve(response.first ?? null)),
            all: vi.fn(() => Promise.resolve({ results: response.all ?? [] })),
            run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: response.run?.changes ?? 1 } }))
          };
        })
      };
    })
  };
  const env = { DB: db, STRIPE_WEBHOOK_SECRET: "whsec_test_secret", CLERK_WEBHOOK_SECRET: "whsec_dGVzdHNlY3JldA==", ...overrides } as unknown as Env;
  return { env, db, statements };
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

async function signStripe(secret: string, body: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

function stripeRequest(body: string, signature: string) {
  return new Request("https://api.example.com/api/v1/webhooks/stripe", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body
  });
}

describe("POST /webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing signature header", async () => {
    const { env } = fakeEnv();
    const response = await worker.fetch(
      new Request("https://api.example.com/api/v1/webhooks/stripe", { method: "POST", body: "{}" }),
      env,
      ctx
    );
    expect(response.status).toBe(401);
  });

  it("rejects an invalid signature without ever touching the webhook_events table", async () => {
    // The webhook secret itself is admin-configurable (checkout-settings, D1
    // backed) - resolving it costs one read even for a garbage signature.
    // What still must never happen is any write to webhook_events.
    const { env, db } = fakeEnv([{ first: null }]);
    const response = await worker.fetch(stripeRequest("{}", "t=123,v1=deadbeef"), env, ctx);
    expect(response.status).toBe(401);
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it("records a new event, processes it, and marks it processed", async () => {
    const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
    const signature = await signStripe("whsec_test_secret", body);
    const { env, statements } = fakeEnv([
      { first: null }, // resolveCheckoutSettings: no stored settings, falls back to env
      { run: { changes: 1 } }, // recordWebhookReceived insert - new row
      { run: { changes: 1 } } // markWebhookProcessing update
      // createOrderFromPaidSession is mocked, no D1 call from it
      // markWebhookProcessed update
    ].concat([{ run: { changes: 1 } }]));

    const response = await worker.fetch(stripeRequest(body, signature), env, ctx);
    const responseBody = await response.json<{ success: boolean; data: { received: boolean; orderCreated: boolean } }>();

    expect(response.status).toBe(200);
    expect(responseBody.data.orderCreated).toBe(true);
    expect(statements.some((s) => s.sql.includes("insert into webhook_events"))).toBe(true);
    expect(statements.some((s) => s.sql.includes("status = 'processed'"))).toBe(true);
    // The full raw body is never persisted - only a minimal summary.
    const insertStatement = statements.find((s) => s.sql.includes("insert into webhook_events"))!;
    const payloadJson = insertStatement.args[3] as string;
    expect(payloadJson.length).toBeLessThan(body.length);
    expect(JSON.parse(payloadJson)).toEqual({ id: "evt_1", type: "checkout.session.completed", objectId: "cs_1" });
  });

  it("short-circuits a duplicate event without reprocessing it", async () => {
    const { createOrderFromPaidSession } = await import("../services/orders");
    const body = JSON.stringify({ id: "evt_dup", type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
    const signature = await signStripe("whsec_test_secret", body);
    const { env } = fakeEnv([
      { first: null }, // resolveCheckoutSettings
      { run: { changes: 0 } }, // recordWebhookReceived: already exists
      { run: { changes: 0 } } // not failed/stale, so it cannot be reclaimed
    ]);

    const response = await worker.fetch(stripeRequest(body, signature), env, ctx);
    const responseBody = await response.json<{ success: boolean; data: { duplicate: boolean } }>();

    expect(response.status).toBe(200);
    expect(responseBody.data.duplicate).toBe(true);
    expect(createOrderFromPaidSession).not.toHaveBeenCalled();
  });

  it("reclaims a previously failed event so Stripe can retry it", async () => {
    const { createOrderFromPaidSession } = await import("../services/orders");
    const body = JSON.stringify({ id: "evt_retry", type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
    const signature = await signStripe("whsec_test_secret", body);
    const { env } = fakeEnv([
      { first: null }, // resolveCheckoutSettings
      { run: { changes: 0 } }, // duplicate insert
      { run: { changes: 1 } }, // failed row atomically reclaimed
      { run: { changes: 1 } }, // processing
      { run: { changes: 1 } } // processed
    ]);

    const response = await worker.fetch(stripeRequest(body, signature), env, ctx);
    expect(response.status).toBe(200);
    expect(createOrderFromPaidSession).toHaveBeenCalledTimes(1);
  });

  it("marks the event failed, reports to Sentry, and returns a non-2xx so Stripe retries", async () => {
    const { createOrderFromPaidSession } = await import("../services/orders");
    vi.mocked(createOrderFromPaidSession).mockRejectedValueOnce(new Error("D1 write failed"));

    const body = JSON.stringify({ id: "evt_fail", type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
    const signature = await signStripe("whsec_test_secret", body);
    const { env, statements } = fakeEnv([
      { first: null }, // resolveCheckoutSettings
      { run: { changes: 1 } },
      { run: { changes: 1 } },
      { run: { changes: 1 } }
    ]);

    const response = await worker.fetch(stripeRequest(body, signature), env, ctx);

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(statements.some((s) => s.sql.includes("status = 'failed'"))).toBe(true);
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /webhooks/clerk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a request missing any of the required svix headers", async () => {
    const { env } = fakeEnv();
    const response = await worker.fetch(
      new Request("https://api.example.com/api/v1/webhooks/clerk", { method: "POST", body: "{}" }),
      env,
      ctx
    );
    expect(response.status).toBe(401);
  });

  it("rejects a correctly signed Clerk webhook with a stale timestamp", async () => {
    const secret = "testsecret";
    const svixId = "msg_stale";
    const svixTimestamp = String(Math.floor(Date.now() / 1000) - 10 * 60);
    const body = JSON.stringify({ type: "user.updated", data: { id: "user_1" } });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${svixId}.${svixTimestamp}.${body}`));
    const signature = `v1,${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;
    const { env, db } = fakeEnv();

    const response = await worker.fetch(
      new Request("https://api.example.com/api/v1/webhooks/clerk", {
        method: "POST",
        headers: { "svix-id": svixId, "svix-timestamp": svixTimestamp, "svix-signature": signature },
        body
      }),
      env,
      ctx
    );
    expect(response.status).toBe(401);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("processes a new user.updated event and marks it processed", async () => {
    const secret = "testsecret"; // base64-decoded form of the whsec_ prefixed secret above
    const svixId = "msg_1";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: "user.updated", data: { id: "user_1", email_addresses: [{ email_address: "a@example.com" }] } });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${svixId}.${svixTimestamp}.${body}`));
    const signature = `v1,${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;

    const { env, statements } = fakeEnv([
      { run: { changes: 1 } }, // recordWebhookReceived insert - new row
      { run: { changes: 1 } }, // markWebhookProcessing
      { first: null }, // existing roles_json lookup (no incoming roles in payload)
      { run: { changes: 1 } }, // users upsert
      { run: { changes: 1 } } // markWebhookProcessed
    ]);

    const response = await worker.fetch(
      new Request("https://api.example.com/api/v1/webhooks/clerk", {
        method: "POST",
        headers: { "svix-id": svixId, "svix-timestamp": svixTimestamp, "svix-signature": signature },
        body
      }),
      env,
      ctx
    );

    expect(response.status).toBe(200);
    expect(statements.some((s) => s.sql.includes("status = 'processed'"))).toBe(true);
  });
});
