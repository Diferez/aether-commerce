import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@aether/core";
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
    batch: vi.fn((stmts: unknown[]) => Promise.resolve(stmts.map(() => ({ success: true, meta: { changes: 1 } }))))
  };
  const env = {
    DB: db,
    CLERK_JWT_ISSUER: "https://clerk.test",
    APP_ORIGIN_ADMIN: "https://admin.example.com",
    APP_ORIGIN_STORE: "https://store.example.com",
    // Keep D1 call-count assertions deterministic. Latency sampling is
    // covered separately by latency-sampling.test.ts.
    PERFORMANCE_SAMPLE_RATE: "0",
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

function urlOf(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

async function mockVerifiedActor(roles: string[], sub = "usr_1") {
  const jose = await import("jose");
  vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
    payload: { sub, azp: "https://admin.example.com", public_metadata: { roles } }
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
    // Guest actor never queries D1 for auth itself - the one call is
    // requirePermission's fire-and-forget admin_failed_attempts metric.
    expect(db.prepare).toHaveBeenCalledTimes(1);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("operational_metrics"));
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
    // The suspension check, then requirePermission's admin_failed_attempts
    // metric - the downgrade to guest happened before the /orders handler
    // could issue its own count/select queries.
    expect(db.prepare).toHaveBeenCalledTimes(2);
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
        body: JSON.stringify({ enabled: true, amountCents: 20000 })
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

  it("lists reviews joined with product/reviewer names for an actor with reviews.moderate", async () => {
    await mockVerifiedActor(["admin"]);
    const { env, statements } = fakeEnv([
      { first: null }, // suspension check
      {
        all: [
          {
            id: "rev_1",
            status: "pending",
            rating: 4,
            title: "Great fit",
            body: "Works well.",
            created_at: "2026-08-19T10:00:00Z",
            updated_at: "2026-08-19T10:00:00Z",
            product_id: "prd_1",
            product_name: "Funda Slim Grip",
            user_id: "user_abc",
            user_email: "buyer@example.com",
            user_name: "Maria Gomez"
          }
        ]
      }
    ]);

    const response = await worker.fetch(adminRequest("/reviews", { token: "tok" }), env, ctx);

    expect(response.status).toBe(200);
    const body = await response.json<{ success: boolean; data: Array<{ product_name: string; user_email: string }> }>();
    expect(body.data[0]).toMatchObject({ product_name: "Funda Slim Grip", user_email: "buyer@example.com" });
    expect(statements.some((s) => s.sql.includes("left join products") && s.sql.includes("left join users"))).toBe(true);
  });

  it("returns 403 for an actor without reviews.moderate (e.g. catalog_manager)", async () => {
    await mockVerifiedActor(["catalog_manager"]);
    const { env } = fakeEnv([{ first: null }]);

    const response = await worker.fetch(adminRequest("/reviews", { token: "tok" }), env, ctx);

    expect(response.status).toBe(403);
  });

  it("approves a review and persists the new status through the real HTTP path", async () => {
    await mockVerifiedActor(["admin"]);
    const { env, statements } = fakeEnv([
      { first: null }, // suspension check
      {} // reviews update
    ]);

    const response = await worker.fetch(
      adminRequest("/reviews/rev_1/moderation", {
        method: "PATCH",
        token: "tok",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approved" })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(200);
    const updateStatement = statements.find((s) => s.sql.includes("update reviews set status"));
    expect(updateStatement?.args).toEqual(["approved", "rev_1"]);
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

  it("GET /admin/audit returns a paginated response and never exposes ip_address/user_agent", async () => {
    await mockVerifiedActor(["admin"]);
    const { env, statements } = fakeEnv([
      { first: null }, // suspension check
      { first: { count: 1 } }, // count(*)
      { all: [{ id: "aud_1", actor_id: "usr_1", action: "product.updated", target_type: "product", target_id: "prd_1", payload_json: "{}", created_at: "2026-08-15 10:00:00" }] }
    ]);

    const response = await worker.fetch(adminRequest("/audit", { token: "tok" }), env, ctx);
    const body = await response.json<{ success: boolean; data: unknown[]; pagination: { total: number } }>();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
    const selectStatement = statements.find((s) => s.sql.includes("select") && s.sql.includes("from audit_logs"));
    expect(selectStatement?.sql).not.toContain("ip_address");
    expect(selectStatement?.sql).not.toContain("user_agent");
  });

  it("GET /admin/audit builds a parameterized WHERE clause from actor/action/requestId filters, never string interpolation", async () => {
    await mockVerifiedActor(["admin"]);
    const { env, statements } = fakeEnv([{ first: null }, { first: { count: 0 } }, { all: [] }]);

    await worker.fetch(
      adminRequest("/audit?actorId=usr_1&action=order.status_changed&requestId=req_abc123", { token: "tok" }),
      env,
      ctx
    );

    const countStatement = statements.find((s) => s.sql.includes("count(*)") && s.sql.includes("audit_logs"));
    expect(countStatement?.sql).toContain("actor_id = ?");
    expect(countStatement?.sql).toContain("action = ?");
    expect(countStatement?.sql).toContain("request_id = ?");
    expect(countStatement?.args).toEqual(["usr_1", "order.status_changed", "req_abc123"]);
  });

  it("GET /admin/audit rejects a malformed date filter instead of passing it through to SQL", async () => {
    await mockVerifiedActor(["admin"]);
    const { env, db } = fakeEnv([{ first: null }]);

    const response = await worker.fetch(adminRequest("/audit?from=not-a-date", { token: "tok" }), env, ctx);

    expect(response.status).toBe(400);
    // Only the suspension check ran - validation rejected the request before any audit_logs query.
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it("GET /admin/audit returns 403 (and never queries audit_logs) for an actor without audit.read, logging the denial", async () => {
    await mockVerifiedActor(["customer"]);
    const { env, db } = fakeEnv([{ first: null }]);

    const response = await worker.fetch(adminRequest("/audit", { token: "tok" }), env, ctx);

    expect(response.status).toBe(403);
    // Suspension check, then requirePermission's admin_failed_attempts
    // metric - never reaches the audit_logs query.
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });

  it("GET /admin/system-health returns operational with honest 'no data' signals when nothing bad has happened", async () => {
    await mockVerifiedActor(["admin"]);
    // Only the suspension check is queued - every other query defaults to
    // null/empty via fakeEnv's fallback, which is exactly what "no data
    // yet" looks like for a freshly deployed instance.
    const { env } = fakeEnv([{ first: null }]);

    const response = await worker.fetch(adminRequest("/system-health", { token: "tok" }), env, ctx);
    const body = await response.json<{
      success: boolean;
      data: { status: string; components: Record<string, { level: string }>; stats: Record<string, unknown> };
    }>();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("operational");
    expect(body.data.components.inventory?.level).toBe("operational");
    expect(body.data.components.webhooks?.level).toBe("operational");
    expect(body.data.stats.negativeInventoryCount).toBe(0);
    expect(body.data.stats.avgLatencyMs).toBeNull();
  });

  it("GET /admin/system-health goes critical when there is negative inventory", async () => {
    await mockVerifiedActor(["admin"]);
    const { env } = fakeEnv([
      { first: null }, // suspension check
      { all: [] }, // recent webhook statuses
      { all: [] }, // blocked paid order rows
      { first: { count: 0 } }, // blocked order count
      { first: { count: 3 } } // negative inventory count
    ]);

    const response = await worker.fetch(adminRequest("/system-health", { token: "tok" }), env, ctx);
    const body = await response.json<{ success: boolean; data: { status: string; components: Record<string, { level: string }>; stats: { negativeInventoryCount: number } } }>();

    expect(response.status).toBe(200);
    expect(body.data.components.inventory?.level).toBe("critical");
    expect(body.data.status).toBe("critical");
    expect(body.data.stats.negativeInventoryCount).toBe(3);
  });

  it("GET /admin/system-health returns 403 for an actor without audit.read", async () => {
    await mockVerifiedActor(["customer"]);
    const { env } = fakeEnv([{ first: null }]);

    const response = await worker.fetch(adminRequest("/system-health", { token: "tok" }), env, ctx);

    expect(response.status).toBe(403);
  });

  it("creates a coupon with the real minimumSubtotal value, not the old hardcoded zero", async () => {
    await mockVerifiedActor(["admin"]);
    const { env, statements } = fakeEnv([
      { first: null }, // suspension check
      {}, // coupons insert or replace
      {} // audit_logs insert
    ]);

    const response = await worker.fetch(
      adminRequest("/coupons", {
        method: "POST",
        token: "tok",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "welcome10", type: "percentage", value: 10, minimumSubtotal: 5000 })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(201);
    const couponInsert = statements.find((s) => s.sql.includes("insert or replace into coupons"));
    expect(couponInsert?.args).toEqual(["WELCOME10", "percentage", 10, 5000]);
  });

  it("rejects a coupon with an invalid type before touching the database", async () => {
    await mockVerifiedActor(["admin"]);
    const { env, db } = fakeEnv([{ first: null }]);

    const response = await worker.fetch(
      adminRequest("/coupons", {
        method: "POST",
        token: "tok",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "BAD1", type: "buy_one_get_one", value: 10 })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(400);
    expect(db.prepare).not.toHaveBeenCalledWith(expect.stringContaining("insert or replace into coupons"));
  });

  it("PATCH /admin/orders/:id/status transitions the order via the shared changeOrderState helper", async () => {
    await mockVerifiedActor(["admin"]);
    const { env, db } = fakeEnv([
      { first: null }, // suspension check
      { first: { state: "paid", payload_json: JSON.stringify({ state: "paid" }) } } // changeOrderState's current-row read
    ]);
    db.batch.mockResolvedValueOnce([{ success: true, meta: { changes: 1 } }, { success: true, meta: { changes: 1 } }]);

    const response = await worker.fetch(
      adminRequest("/orders/ord_1/status", {
        method: "PATCH",
        token: "tok",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "processing" })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ success: boolean; data?: { previousState: string; state: string } }>();
    expect(body.data).toMatchObject({ previousState: "paid", state: "processing" });
  });

  it("PATCH /admin/orders/:id/status returns 409 ORDER_TRANSITION_INVALID for an illegal move", async () => {
    await mockVerifiedActor(["admin"]);
    const { env } = fakeEnv([
      { first: null }, // suspension check
      { first: { state: "cancelled", payload_json: "{}" } } // terminal state, no transitions out
    ]);

    const response = await worker.fetch(
      adminRequest("/orders/ord_1/status", {
        method: "PATCH",
        token: "tok",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "paid" })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(409);
    const body = await response.json<{ success: boolean; error?: { code: string } }>();
    expect(body.error?.code).toBe("ORDER_TRANSITION_INVALID");
  });

  it("no longer exposes the removed fake POST /admin/refunds stub", async () => {
    await mockVerifiedActor(["admin"]);
    const { env } = fakeEnv([{ first: null }]);

    const response = await worker.fetch(adminRequest("/refunds", { method: "POST", token: "tok" }), env, ctx);

    expect(response.status).toBe(404);
  });

  it("POST /admin/orders/:id/refund refunds a paid Stripe order through the real Stripe API call", async () => {
    await mockVerifiedActor(["admin"]);
    const { env } = fakeEnv(
      [
        { first: null }, // suspension check
        {
          first: {
            channel: "stripe",
            payment_status: "paid",
            payload_json: JSON.stringify({ payment: { providerPaymentIntentId: "pi_123" } }),
            total: 5000,
            stock_restored_at: null,
            email: "shopper@example.com",
            number: "AETH-1"
          }
        }
      ],
      { STRIPE_SECRET_KEY: "sk_test_123" }
    );
    const fetchMock = vi.fn((url: RequestInfo | URL) =>
      urlOf(url).includes("api.stripe.com/v1/refunds")
        ? Promise.resolve(new Response(JSON.stringify({ id: "re_123", status: "succeeded" }), { status: 200 }))
        : Promise.resolve(new Response("{}", { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await worker.fetch(
        adminRequest("/orders/ord_1/refund", { method: "POST", token: "tok", headers: { "content-type": "application/json" }, body: "{}" }),
        env,
        ctx
      );
      const body = await response.json<{ success: boolean; data?: { orderId: string; paymentStatus: string; providerRefundId: string } }>();

      expect(response.status).toBe(201);
      expect(body.data).toMatchObject({ orderId: "ord_1", paymentStatus: "refunded", providerRefundId: "re_123" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("POST /admin/orders/:id/refund refunds a paid Wompi order by voiding the transaction - previously rejected as Stripe-only", async () => {
    await mockVerifiedActor(["admin"]);
    const { env } = fakeEnv(
      [
        { first: null }, // suspension check
        {
          first: {
            channel: "wompi",
            payment_status: "paid",
            payload_json: JSON.stringify({ payment: { providerPaymentIntentId: "txn_123" } }),
            total: 5000,
            stock_restored_at: null,
            email: "shopper@example.com",
            number: "AETH-2"
          }
        }
      ],
      { WOMPI_SECRET_KEY: "prv_test_123" }
    );
    const fetchMock = vi.fn((url: RequestInfo | URL) =>
      urlOf(url).includes("/transactions/txn_123/void")
        ? Promise.resolve(new Response(JSON.stringify({ data: { id: "txn_123", status: "VOIDED" } }), { status: 200 }))
        : Promise.resolve(new Response("{}", { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await worker.fetch(
        adminRequest("/orders/ord_2/refund", { method: "POST", token: "tok", headers: { "content-type": "application/json" }, body: "{}" }),
        env,
        ctx
      );
      const body = await response.json<{ success: boolean; data?: { orderId: string; paymentStatus: string; providerRefundId: string } }>();

      expect(response.status).toBe(201);
      expect(body.data).toMatchObject({ orderId: "ord_2", paymentStatus: "refunded", providerRefundId: "txn_123" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("POST /admin/orders/:id/refund still refuses a whatsapp order - no payment provider to refund through", async () => {
    await mockVerifiedActor(["admin"]);
    const { env, db } = fakeEnv([
      { first: null }, // suspension check
      { first: { channel: "whatsapp", payment_status: "paid", payload_json: "{}", total: 5000, stock_restored_at: null, email: "shopper@example.com", number: "AETH-3" } }
    ]);

    const response = await worker.fetch(
      adminRequest("/orders/ord_3/refund", { method: "POST", token: "tok", headers: { "content-type": "application/json" }, body: "{}" }),
      env,
      ctx
    );
    const body = await response.json<{ success: boolean; error?: { code: string } }>();

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("REFUND_NOT_APPLICABLE");
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("GET /admin/summary computes real revenue/orders from the orders table", async () => {
    await mockVerifiedActor(["admin"]);
    const { env } = fakeEnv([
      { first: null }, // suspension check
      { first: { revenue: 543200, orders: 12 } }, // computeDashboardSummary revenue/orders
      { first: { count: 2 } } // computeDashboardSummary low-stock count
    ]);

    const response = await worker.fetch(adminRequest("/summary", { token: "tok" }), env, ctx);
    const body = await response.json<{ success: boolean; data: { revenue: number; orders: number; lowStock: number } }>();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ revenue: 543200, orders: 12, lowStock: 2 });
  });

  it("GET /admin/integration-settings returns a masked summary, never a plaintext secret", async () => {
    await mockVerifiedActor(["admin"]);
    const { env } = fakeEnv([
      { first: null }, // suspension check
      { first: null } // no stored integrations row - falls back to env vars
    ]);

    const response = await worker.fetch(
      adminRequest("/integration-settings", { token: "tok" }),
      { ...env, RESEND_API_KEY: "re_env_secret_value" },
      ctx
    );
    const body = await response.json<{ success: boolean; data: { resend: { configured: boolean; apiKeyPreview: string | null } } }>();

    expect(response.status).toBe(200);
    expect(body.data.resend).toEqual({ configured: true, apiKeyPreview: "re_env••••alue" });
    expect(JSON.stringify(body)).not.toContain("re_env_secret_value");
  });

  it("PUT /admin/integration-settings refuses to store a secret when AETHER_SETTINGS_ENCRYPTION_KEY is not configured", async () => {
    await mockVerifiedActor(["admin"]);
    const { env, db } = fakeEnv([{ first: null }]); // suspension check only - the route fails before ever touching D1

    const response = await worker.fetch(
      adminRequest("/integration-settings", {
        method: "PUT",
        token: "tok",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resend: { apiKey: "re_new_key" } })
      }),
      env,
      ctx
    );
    const body = await response.json<{ success: boolean; error?: { code: string } }>();

    expect(response.status).toBe(500);
    expect(body.error?.code).toBe("SETTINGS_ENCRYPTION_NOT_CONFIGURED");
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it("PUT /admin/integration-settings stores a new secret and returns the updated masked summary", async () => {
    await mockVerifiedActor(["admin"]);
    // Row #4 stands in for the row the write in row #3 would have produced -
    // this mock never actually persists between calls, so the ciphertext
    // summarize() reads back afterward has to be computed the same way the
    // real repository.write() would encrypt it.
    const storedAfterWrite = { value_json: JSON.stringify({ gemini: { apiKey: await encryptSecret("test-passphrase", "AIza_new_key") } }) };
    const { env, statements } = fakeEnv([
      { first: null }, // suspension check
      { first: null }, // update(): read current (nothing stored yet)
      {}, // update(): write
      { first: storedAfterWrite } // summarize(): read back after write
    ]);

    const response = await worker.fetch(
      adminRequest("/integration-settings", {
        method: "PUT",
        token: "tok",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gemini: { apiKey: "AIza_new_key" } })
      }),
      { ...env, AETHER_SETTINGS_ENCRYPTION_KEY: "test-passphrase" },
      ctx
    );
    const body = await response.json<{ success: boolean; data: { gemini: { configured: boolean } } }>();

    expect(response.status).toBe(200);
    expect(body.data.gemini.configured).toBe(true);
    const write = statements.find((s) => s.sql.includes("insert into application_settings"));
    expect(write?.sql).toContain("'integrations'");
    expect(String(write?.args[0])).not.toContain("AIza_new_key");
  });

  it("PUT /admin/integration-settings returns 403 for an actor without settings.manage", async () => {
    await mockVerifiedActor(["customer"]);
    const { env } = fakeEnv([{ first: null }]);

    const response = await worker.fetch(
      adminRequest("/integration-settings", {
        method: "PUT",
        token: "tok",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resend: { apiKey: "re_new_key" } })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(403);
  });
});
