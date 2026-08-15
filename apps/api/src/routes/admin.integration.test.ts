import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import worker from "../index";

// Exercises the real Hono app end-to-end (worker.fetch -> global middleware
// chain -> routing -> handler -> D1) instead of testing service functions in
// isolation, closing the "does the assembly actually work" gap that the
// existing per-service unit tests don't cover. D1 is hand-mocked the same
// way apps/api/src/services/{orders,customers}.test.ts already do; jose is
// module-mocked the same way middleware/auth.test.ts already does, since
// there is no Clerk test tenant available for a real JWKS round trip.
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  jwtVerify: vi.fn()
}));

type QueuedResponse = { first?: unknown; all?: unknown[] };

function fakeEnv(responses: QueuedResponse[] = [], overrides: Partial<Env> = {}) {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  let callIndex = 0;
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
        // Some real handlers call .prepare(sql).first()/.all() with no
        // .bind() step (e.g. GET /coupons, GET /settings) - mirrors the same
        // extension made to inventory.test.ts's mock this session for the
        // same reason.
        first: vi.fn(() => Promise.resolve(response.first ?? null)),
        all: vi.fn(() => Promise.resolve({ results: response.all ?? [] })),
        run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } }))
      };
    }),
    batch: vi.fn((stmts: unknown[]) => Promise.resolve(stmts.map(() => ({ success: true }))))
  };
  const env = {
    DB: db,
    CLERK_JWT_ISSUER: "https://clerk.test",
    APP_ORIGIN_ADMIN: "https://admin.example.com",
    APP_ORIGIN_STORE: "https://store.example.com",
    ...overrides
  } as unknown as Env;
  return { env, db, statements };
}

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {}
} as unknown as ExecutionContext;

function adminRequest(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, headers, ...rest } = init;
  return new Request(`https://api.example.com/api/v1/admin${path}`, {
    ...rest,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...((headers as Record<string, string>) ?? {})
    }
  });
}

async function mockVerifiedActor(roles: string[], sub = "usr_1") {
  const jose = await import("jose");
  vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
    payload: { sub, public_metadata: { roles } }
  } as never);
}

describe("admin routes integration (real middleware chain, mocked D1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for an unauthenticated request to a protected admin route", async () => {
    const { env, db } = fakeEnv();
    const response = await worker.fetch(adminRequest("/orders"), env, ctx);

    expect(response.status).toBe(403);
    // Guest actor never touches D1 - auth() returns before any query.
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("returns 403 when a verified actor lacks the required permission", async () => {
    await mockVerifiedActor(["customer"]);
    const { env } = fakeEnv([{ first: null }]);

    const response = await worker.fetch(adminRequest("/orders", { token: "tok" }), env, ctx);

    expect(response.status).toBe(403);
    const body = await response.json<{ success: boolean; error?: { code: string } }>();
    expect(body.error?.code).toBe("FORBIDDEN");
  });

  it("returns 200 and runs the real handler and D1 queries for an authorized request", async () => {
    await mockVerifiedActor(["admin"]);
    const { env, statements } = fakeEnv([
      { first: null }, // auth.ts suspension check
      { first: { count: 0 } }, // admin.ts count(*)
      { all: [] } // admin.ts paginated rows
    ]);

    const response = await worker.fetch(adminRequest("/orders", { token: "tok" }), env, ctx);

    expect(response.status).toBe(200);
    const body = await response.json<{ success: boolean; data: { pagination: { total: number } } }>();
    expect(body.success).toBe(true);
    expect(body.data.pagination.total).toBe(0);
    expect(statements.some((s) => s.sql.includes("from orders"))).toBe(true);
  });

  it("downgrades a suspended user to guest and blocks the request end-to-end", async () => {
    await mockVerifiedActor(["admin"]);
    const { env, db } = fakeEnv([{ first: { status: "suspended" } }]);

    const response = await worker.fetch(adminRequest("/orders", { token: "tok" }), env, ctx);

    expect(response.status).toBe(403);
    // Only the suspension check ran - the downgrade to guest happened before
    // the /orders handler could issue its own count/select queries.
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it("saves shipping settings and writes an audit log entry through the real HTTP path", async () => {
    await mockVerifiedActor(["admin"]);
    const { env, statements } = fakeEnv([
      { first: null }, // suspension check
      {}, // application_settings upsert
      {} // audit_logs insert
    ]);

    const response = await worker.fetch(
      adminRequest("/settings/shipping", {
        method: "PATCH",
        token: "tok",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          freeShippingThreshold: 20000,
          countries: ["US"],
          options: [{ id: "standard", label: "Standard", amount: 500, currency: "USD", estimatedDays: "3-5" }]
        })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(200);
    expect(statements.some((s) => s.sql.includes("application_settings"))).toBe(true);
    expect(statements.some((s) => s.sql.includes("audit_logs"))).toBe(true);
    const auditStatement = statements.find((s) => s.sql.includes("audit_logs"));
    expect(auditStatement?.args).toContain("settings.updated");
  });

  it("blocks a mutation for an actor in demo mode via the real requirePermission middleware", async () => {
    // No registered admin route today has a literal /admin/demo/* mutation
    // path (the only /demo route is the public GET /demo/summary), so this
    // exercises requirePermission() directly with a demo-mode actor rather
    // than through routing - still the real production function, just not
    // reachable end-to-end via worker.fetch with the current route table.
    const { requirePermission } = await import("../middleware/admin");
    const middleware = requirePermission("settings.manage");
    const next = vi.fn();
    const context = {
      req: { method: "PATCH" },
      get: (key: string) => (key === "actor" ? { roles: ["admin"], permissions: ["settings.manage"], mode: "demo" } : undefined),
      json: (body: unknown, status?: number) => new Response(JSON.stringify(body), { status: status ?? 200 })
    } as unknown as Parameters<typeof middleware>[0];

    const response = (await middleware(context, next)) as Response;

    expect(response.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("reflects the admin origin on CORS preflight but omits it for an unrecognized origin", async () => {
    const { env, db } = fakeEnv();

    const allowed = await worker.fetch(
      new Request("https://api.example.com/api/v1/admin/orders", {
        method: "OPTIONS",
        headers: { origin: "https://admin.example.com", "access-control-request-method": "GET" }
      }),
      env,
      ctx
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://admin.example.com");

    const denied = await worker.fetch(
      new Request("https://api.example.com/api/v1/admin/orders", {
        method: "OPTIONS",
        headers: { origin: "https://evil.example.com", "access-control-request-method": "GET" }
      }),
      env,
      ctx
    );
    expect(denied.status).toBe(204);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();

    // Preflight is answered by the cors() middleware before auth/routing run.
    expect(db.prepare).not.toHaveBeenCalled();
  });
});
