import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { Actor, Permission, Role } from "@aether/schemas";
import { OBSERVABILITY_EVENTS, permissionsForRoles } from "@aether/core";
import type { AppBindings } from "../types";
import { getLogger } from "../services/observability";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getBearerToken(header?: string): string | undefined {
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return undefined;
  }
  return header.slice(7).trim();
}

function parseRoles(value: unknown): Role[] {
  const roles = Array.isArray(value) ? value : [];
  const allowed = new Set<Role>([
    "customer",
    "support",
    "catalog_manager",
    "order_manager",
    "admin",
    "super_admin",
    "demo_viewer"
  ]);
  const parsed = roles.filter((role): role is Role => typeof role === "string" && allowed.has(role as Role));
  return parsed.length > 0 ? parsed : ["customer"];
}

function authorizedParties(c: Parameters<MiddlewareHandler<AppBindings>>[0]): string[] {
  return [c.env.APP_ORIGIN_STORE, c.env.APP_ORIGIN_ADMIN]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.replace(/\/$/, ""));
}

export const auth = (): MiddlewareHandler<AppBindings> => async (c, next) => {
  const token = getBearerToken(c.req.header("authorization"));
  const guest: Actor = {
    roles: ["guest"],
    permissions: permissionsForRoles(["guest"]),
    mode: c.req.path.includes("/admin/demo") ? "demo" : "public"
  };

  if (!token || !c.env.CLERK_JWT_ISSUER) {
    c.set("actor", guest);
    await next();
    return;
  }

  try {
    const issuer = c.env.CLERK_JWT_ISSUER.replace(/\/$/, "");
    let jwks = jwksCache.get(issuer);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
      jwksCache.set(issuer, jwks);
    }

    const { payload } = await jwtVerify(token, jwks, { issuer });
    const allowedParties = authorizedParties(c);
    const azp = typeof payload.azp === "string" ? payload.azp.replace(/\/$/, "") : undefined;
    if (allowedParties.length > 0 && (!azp || !allowedParties.includes(azp))) {
      throw new Error("Token authorized party is not allowed");
    }

    // A suspended account loses access on its very next request, not just
    // future logins - this is a real block, not an advisory label. Only
    // runs on the already-token-verified path (never for anonymous/guest
    // traffic), and fails open both when no users row exists yet (the
    // registry is sparse until the Clerk webhook backfills it - absence
    // isn't suspension). A database error, however, fails closed: a
    // suspended account must never regain access during a D1 outage.
    if (c.env.DB) {
      try {
        const row = await c.env.DB.prepare("select status from users where clerk_id = ? limit 1")
          .bind(payload.sub)
          .first<{ status: string }>();
        if (row?.status === "suspended") {
          c.set("actor", guest);
          await next();
          return;
        }
      } catch (error) {
        getLogger(c.env).warn(OBSERVABILITY_EVENTS.databaseQueryFailed, {
          requestId: c.get("requestId"),
          metadata: { query: "suspension_lookup", failOpen: false },
          error
        });
        c.set("actor", guest);
        await next();
        return;
      }
    }

    const metadata = payload.public_metadata as { roles?: Role[]; permissions?: Permission[] } | undefined;
    const roles = parseRoles(metadata?.roles ?? payload.roles);
    const permissions = [...new Set([...(metadata?.permissions ?? []), ...permissionsForRoles(roles)])];

    c.set("actor", {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      roles,
      permissions,
      mode: c.req.path.includes("/admin/demo") ? "demo" : "private"
    });
  } catch {
    c.set("actor", guest);
  }

  await next();
};
