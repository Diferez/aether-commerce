import type { MiddlewareHandler } from "hono";
import { hasPermission, isDemoMutationBlocked } from "@aether/core";
import type { Permission } from "@aether/schemas";
import type { AppBindings } from "../types";
import { fail } from "../http";

export function requirePermission(permission: Permission): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const actor = c.get("actor");

    if (isDemoMutationBlocked(actor, c.req.method)) {
      return fail(c, 403, "DEMO_MODE", "Public demo mode. Changes are disabled.");
    }

    if (!hasPermission(actor, permission)) {
      return fail(c, 403, "FORBIDDEN", "You do not have permission for this action.");
    }

    await next();
  };
}
