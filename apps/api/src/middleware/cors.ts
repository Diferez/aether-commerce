import { cors } from "hono/cors";
import type { Context } from "hono";
import type { AppBindings } from "../types";

export function aetherCors() {
  return cors({
    origin(origin, c: Context<AppBindings>) {
      // Requests with no Origin header aren't browser-mediated CORS requests
      // (curl, server-to-server, health checks) - safe to allow.
      if (!origin) return "*";
      // Deny by default: an empty/misconfigured allowlist must never be
      // treated as "allow everyone", since credentials: true means a
      // reflected origin lets any site read authenticated responses.
      const allowed = [c.env.APP_ORIGIN_STORE, c.env.APP_ORIGIN_ADMIN].filter(Boolean);
      return allowed.includes(origin) ? origin : "";
    },
    allowHeaders: [
      "authorization",
      "content-type",
      "x-request-id",
      "x-idempotency-key",
      "x-aether-customer-email",
      "x-aether-cart-token"
    ],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 600
  });
}
