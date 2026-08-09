import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../types";
import { fail } from "../http";

type RateLimitProfile = "global" | "mutation" | "sensitive";

const RATE_LIMITS: Record<RateLimitProfile, { limit: number; windowMs: number; retryAfter: number }> = {
  global: { limit: 240, windowMs: 60_000, retryAfter: 60 },
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
  if (
    pathname.startsWith("/api/v1/checkout") ||
    pathname.startsWith("/api/v1/contact") ||
    pathname.startsWith("/api/v1/webhooks") ||
    pathname.startsWith("/api/v1/admin")
  ) {
    return "sensitive";
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    return "mutation";
  }

  return "global";
}

async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function actorKey(c: Parameters<MiddlewareHandler<AppBindings>>[0]) {
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
    const profile = profileForRequest(c.req.method, url.pathname);
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
