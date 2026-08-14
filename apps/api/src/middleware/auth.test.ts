import { describe, expect, it, vi } from "vitest";
import { auth } from "./auth";

// jwtVerify/createRemoteJWKSet do a real network fetch to resolve the
// issuer's JWKS - there is no Clerk test tenant available to this suite, so
// the module is mocked instead. This isolates exactly what auth.ts is
// responsible for (turning a verified JWT payload into an Actor with the
// right roles/permissions/mode) from jose's own signature-verification
// correctness, which is jose's concern, not this codebase's.
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  jwtVerify: vi.fn()
}));

// Derived directly from auth()'s own signature rather than reconstructing
// Hono's generic Context<Bindings, Path, Input> type by hand - guarantees
// the fake context objects below are assignable to whatever auth() actually
// expects, including its route-path type parameter.
type MiddlewareContext = Parameters<ReturnType<typeof auth>>[0];

describe("auth middleware", () => {
  it("assigns the guest actor with public mode when there is no token", async () => {
    const middleware = auth();
    let captured: unknown;
    const context = {
      req: { header: () => undefined, path: "/api/v1/products" },
      env: {},
      set: (key: string, value: unknown) => key === "actor" && (captured = value)
    } as unknown as MiddlewareContext;
    await middleware(context, async () => {});
    expect(captured).toMatchObject({ roles: ["guest"], mode: "public" });
  });

  it("marks requests under /admin/demo as demo mode even without a token", async () => {
    const middleware = auth();
    let captured: unknown;
    const context = {
      req: { header: () => undefined, path: "/api/v1/admin/demo/summary" },
      env: {},
      set: (key: string, value: unknown) => key === "actor" && (captured = value)
    } as unknown as MiddlewareContext;
    await middleware(context, async () => {});
    expect(captured).toMatchObject({ mode: "demo" });
  });

  it("falls back to guest when CLERK_JWT_ISSUER is not configured, even with a bearer token", async () => {
    const middleware = auth();
    let captured: unknown;
    const context = {
      req: { header: () => "Bearer some-token", path: "/api/v1/admin/products" },
      env: {},
      set: (key: string, value: unknown) => key === "actor" && (captured = value)
    } as unknown as MiddlewareContext;
    await middleware(context, async () => {});
    expect(captured).toMatchObject({ roles: ["guest"], mode: "public" });
  });

  it("grants admin roles/permissions from a verified token's public_metadata", async () => {
    const jose = await import("jose");
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: { sub: "usr_1", public_metadata: { roles: ["admin"] } }
    } as never);

    const middleware = auth();
    let captured: unknown;
    const context = {
      req: { header: () => "Bearer valid-token", path: "/api/v1/admin/products" },
      env: { CLERK_JWT_ISSUER: "https://clerk.example.com" },
      set: (key: string, value: unknown) => key === "actor" && (captured = value)
    } as unknown as MiddlewareContext;
    await middleware(context, async () => {});

    expect(captured).toMatchObject({ userId: "usr_1", roles: ["admin"], mode: "private" });
    expect((captured as { permissions: string[] }).permissions).toContain("products.write");
  });

  it("falls back to guest when token verification throws (expired/invalid token)", async () => {
    const jose = await import("jose");
    vi.mocked(jose.jwtVerify).mockRejectedValueOnce(new Error("signature verification failed"));

    const middleware = auth();
    let captured: unknown;
    const context = {
      req: { header: () => "Bearer garbage", path: "/api/v1/admin/products" },
      env: { CLERK_JWT_ISSUER: "https://clerk.example.com" },
      set: (key: string, value: unknown) => key === "actor" && (captured = value)
    } as unknown as MiddlewareContext;
    await middleware(context, async () => {});

    expect(captured).toMatchObject({ roles: ["guest"] });
  });

  function fakeDb(row: { status: string } | null) {
    return {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(() => Promise.resolve(row))
        }))
      }))
    };
  }

  it("downgrades a verified admin token to guest when the matching users row is suspended", async () => {
    const jose = await import("jose");
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: { sub: "usr_1", public_metadata: { roles: ["admin"] } }
    } as never);

    const middleware = auth();
    let captured: unknown;
    const context = {
      req: { header: () => "Bearer valid-token", path: "/api/v1/admin/products" },
      env: { CLERK_JWT_ISSUER: "https://clerk.example.com", DB: fakeDb({ status: "suspended" }) },
      set: (key: string, value: unknown) => key === "actor" && (captured = value)
    } as unknown as MiddlewareContext;
    await middleware(context, async () => {});

    expect(captured).toMatchObject({ roles: ["guest"], mode: "public" });
  });

  it("keeps admin roles when no users row exists yet for the token's subject (fail-open on absence)", async () => {
    const jose = await import("jose");
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: { sub: "usr_1", public_metadata: { roles: ["admin"] } }
    } as never);

    const middleware = auth();
    let captured: unknown;
    const context = {
      req: { header: () => "Bearer valid-token", path: "/api/v1/admin/products" },
      env: { CLERK_JWT_ISSUER: "https://clerk.example.com", DB: fakeDb(null) },
      set: (key: string, value: unknown) => key === "actor" && (captured = value)
    } as unknown as MiddlewareContext;
    await middleware(context, async () => {});

    expect(captured).toMatchObject({ userId: "usr_1", roles: ["admin"], mode: "private" });
  });

  it("keeps admin roles when the suspension lookup itself throws (fail-open on D1 error)", async () => {
    const jose = await import("jose");
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: { sub: "usr_1", public_metadata: { roles: ["admin"] } }
    } as never);

    const throwingDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(() => Promise.reject(new Error("D1 unavailable")))
        }))
      }))
    };

    const middleware = auth();
    let captured: unknown;
    const context = {
      req: { header: () => "Bearer valid-token", path: "/api/v1/admin/products" },
      env: { CLERK_JWT_ISSUER: "https://clerk.example.com", DB: throwingDb },
      set: (key: string, value: unknown) => key === "actor" && (captured = value)
    } as unknown as MiddlewareContext;
    await middleware(context, async () => {});

    expect(captured).toMatchObject({ userId: "usr_1", roles: ["admin"], mode: "private" });
  });
});
