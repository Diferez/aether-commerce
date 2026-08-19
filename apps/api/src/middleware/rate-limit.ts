import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../types";
import { fail } from "../http";

type RateLimitProfile = "global" | "account" | "mutation" | "sensitive";

const RATE_LIMITS: Record<RateLimitProfile, { limit: number; windowMs: number; retryAfter: number }> = {
  global: { limit: 240, windowMs: 60_000, retryAfter: 60 },
  account: { limit: 600, windowMs: 60_000, retryAfter: 60 },
  mutation: { limit: 60, windowMs: 60_000, retryAfter: 60 },
  sensitive: { limit: 20, windowMs: 60_000, retryAfter: 60 }
};

const buckets = new Map<string, { count: number; resetAt: number }>();

function normalizedRouteKey(method: string, pathname: string) {
  const normalizedPath = pathname
    .replace(/\/api\/v1\/cart\/[^/]+\/items\/[^/]+$/, "/api/v1/cart/:id/items/:itemId")
    .replace(/\/api\/v1\/cart\/[^/]+\/items$/, "/api/v1/cart/:id/items")
    .replace(/\/api\/v1\/cart\/[^/]+\/coupon$/, "/api/v1/cart/:id/coupon")
    .replace(/\/api\/v1\/cart\/[^/]+\/token$/, "/api/v1/cart/:id/token")
    .replace(/\/api\/v1\/cart\/[^/]+$/, "/api/v1/cart/:id")
    .replace(/\/api\/v1\/catalog\/products\/[^/]+$/, "/api/v1/catalog/products/:slug")
    .replace(/\/api\/v1\/account\/orders\/[^/]+$/, "/api/v1/account/orders/:id");

  return `${method.toUpperCase()}:${normalizedPath}`;
}

function profileForRequest(method: string, pathname: string): RateLimitProfile {
  const normalizedMethod = method.toUpperCase();

  if (normalizedMethod === "OPTIONS") {
    return "global";
  }

  if (
    pathname.startsWith("/api/v1/checkout") ||
    pathname.startsWith("/api/v1/contact") ||
    pathname.startsWith("/api/v1/webhooks") ||
    pathname.startsWith("/api/v1/admin")
  ) {
    return "sensitive";
  }

  if (pathname.startsWith("/api/v1/account")) {
    return ["GET", "HEAD"].includes(normalizedMethod) ? "account" : "mutation";
  }

  if (!["GET", "HEAD"].includes(normalizedMethod)) {
    return "mutation";
  }

  return "global";
}

function effectiveProfile(c: Parameters<MiddlewareHandler<AppBindings>>[0], profile: RateLimitProfile) {
  const actor = c.get("actor");
  if (profile === "account" && !actor.userId) {
    return "sensitive";
  }

  return profile;
}

async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function actorKey(c: Parameters<MiddlewareHandler<AppBindings>>[0]) {
  const actor = c.get("actor");
  if (actor.userId) return `user:${await digest(actor.userId)}`;

  const authorization = c.req.header("authorization");
  if (authorization) return `auth:${await digest(authorization)}`;

  const cartToken = c.req.header("x-aether-cart-token");
  if (cartToken) return `cart:${await digest(cartToken)}`;

  const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  return `ip:${ip}`;
}

function nativeLimiter(c: Parameters<MiddlewareHandler<AppBindings>>[0], profile: RateLimitProfile) {
  if (profile === "sensitive") return c.env.RATE_LIMITER_SENSITIVE;
  if (profile === "mutation") return c.env.RATE_LIMITER_MUTATION;
  if (profile === "account") return c.env.RATE_LIMITER_ACCOUNT;
  return c.env.RATE_LIMITER_GLOBAL;
}

function localLimit(key: string, profile: RateLimitProfile) {
  const policy = RATE_LIMITS[profile];
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
    return false;
  }

  if (bucket.count >= policy.limit) {
    return true;
  }

  bucket.count += 1;
  return false;
}

export function rateLimit(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const url = new URL(c.req.url);
    const requestedProfile = profileForRequest(c.req.method, url.pathname);
    const profile = effectiveProfile(c, requestedProfile);
    const key = `${profile}:${await actorKey(c)}:${normalizedRouteKey(c.req.method, url.pathname)}`;
    const limiter = nativeLimiter(c, profile);
    const limited = limiter ? !(await limiter.limit({ key })).success : localLimit(key, profile);

    if (limited) {
      c.header("Retry-After", String(RATE_LIMITS[profile].retryAfter));
      return fail(c, 429, "RATE_LIMITED", "Too many requests. Try again shortly.");
    }

    await next();
  };
}
