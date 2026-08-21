import type { MiddlewareHandler } from "hono";
import { hasPermission, isDemoMutationBlocked, OBSERVABILITY_EVENTS } from "@aether-commerce/core";
import type { Permission } from "@aether-commerce/schemas";
import type { AppBindings } from "../types";
import { fail } from "../http";
import { getLogger } from "../services/observability";
import { incrementMetric } from "../services/metrics";

export function requirePermission(permission: Permission): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const actor = c.get("actor");

    if (isDemoMutationBlocked(actor, c.req.method)) {
      return fail(c, 403, "DEMO_MODE", "Public demo mode. Changes are disabled.");
    }

    if (!hasPermission(actor, permission)) {
      // A single structured log line, not another permission-gated write -
      // this can never recurse into itself. Never triggered by a
      // successful audit.read - only by the denial itself.
      getLogger(c.env).warn(OBSERVABILITY_EVENTS.authPermissionDenied, {
        requestId: c.get("requestId"),
        userId: actor.userId,
        route: new URL(c.req.url).pathname,
        method: c.req.method,
        metadata: { permission, roles: actor.roles }
      });
      // Fire-and-forget via waitUntil - a metrics write must never add
      // latency to a 403 response, and this endpoint is exactly what an
      // automated scanner would hammer.
      c.executionCtx.waitUntil(incrementMetric(c.env, "admin_failed_attempts").catch(() => {}));
      return fail(c, 403, "FORBIDDEN", "You do not have permission for this action.");
    }

    await next();
  };
}
