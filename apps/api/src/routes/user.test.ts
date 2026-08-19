import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import worker from "../index";

// Same real-middleware-chain pattern as admin.integration.test.ts - only
// the review submission route's new features.reviews gate is covered here
// (see routes/user.ts), since no other route in this file changed.
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  jwtVerify: vi.fn()
}));

type QueuedResponse = { first?: unknown; all?: unknown[] };

function fakeEnv(responses: QueuedResponse[] = [], overrides: Partial<Env> = {}) {
  let callIndex = 0;
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const response = responses[callIndex] ?? {};
      callIndex += 1;
      return {
        bind: vi.fn((...args: unknown[]) => {
          statements.push({ sql, args });
          return {
            first: vi.fn(() => Promise.resolve(response.first ?? null)),
            all: vi.fn(() => Promise.resolve({ results: response.all ?? [] })),
            run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } }))
          };
        }),
        first: vi.fn(() => Promise.resolve(response.first ?? null)),
        all: vi.fn(() => Promise.resolve({ results: response.all ?? [] })),
        run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } }))
      };
    })
  };
  const env = {
    DB: db,
    CLERK_JWT_ISSUER: "https://clerk.test",
    APP_ORIGIN_ADMIN: "https://admin.example.com",
    APP_ORIGIN_STORE: "https://store.example.com",
    PERFORMANCE_SAMPLE_RATE: "0",
    ...overrides
  } as unknown as Env;
  return { env, db, statements };
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function apiRequest(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, headers, ...rest } = init;
  return new Request(`https://api.example.com/api/v1${path}`, {
    ...rest,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...((headers as Record<string, string>) ?? {})
    }
  });
}

async function mockVerifiedActor(roles: string[], sub = "user_1") {
  const jose = await import("jose");
  vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
    payload: { sub, azp: "https://store.example.com", public_metadata: { roles } }
  } as never);
}

describe("POST /products/:id/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a pending review when reviews are enabled (or no brand setting is persisted yet, matching the enabled-by-default value)", async () => {
    await mockVerifiedActor(["customer"]);
    const { env, statements } = fakeEnv([
      { first: null }, // suspension check
      { first: null }, // application_settings brand read -> falls back to defaultBrandSettings (reviews: true)
      {} // reviews insert
    ]);

    const response = await worker.fetch(
      apiRequest("/products/prd_1/reviews", {
        method: "POST",
        token: "tok",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating: 5, title: "Great product", body: "Worked exactly as described." })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(201);
    expect(statements.some((s) => s.sql.includes("insert into reviews"))).toBe(true);
  });

  it("rejects a new review with REVIEWS_DISABLED when the admin toggle is off, without ever inserting one", async () => {
    await mockVerifiedActor(["customer"]);
    const { env, db } = fakeEnv([
      { first: null }, // suspension check
      { first: { value_json: JSON.stringify({ features: { reviews: false } }) } } // application_settings brand read
    ]);

    const response = await worker.fetch(
      apiRequest("/products/prd_1/reviews", {
        method: "POST",
        token: "tok",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating: 5, title: "Great product", body: "Worked exactly as described." })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(403);
    const body = await response.json<{ success: boolean; error?: { code: string } }>();
    expect(body.error?.code).toBe("REVIEWS_DISABLED");
    expect(db.prepare).not.toHaveBeenCalledWith(expect.stringContaining("insert into reviews"));
  });

  it("requires authentication before touching the database", async () => {
    const { env, db } = fakeEnv();

    const response = await worker.fetch(
      apiRequest("/products/prd_1/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating: 5, title: "Great product", body: "Worked exactly as described." })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(401);
    expect(db.prepare).not.toHaveBeenCalled();
  });
});
