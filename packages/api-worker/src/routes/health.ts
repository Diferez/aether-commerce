import { Hono } from "hono";
import { OBSERVABILITY_EVENTS } from "@aether-commerce/core";
import type { AppBindings } from "../types";
import { fail, ok } from "../http";
import { getLogger } from "../services/observability";

export const healthRoutes = new Hono<AppBindings>();

// Liveness: confirms the process is running and able to respond at all -
// no dependency checks, no D1 access, nothing that could itself be slow or
// flaky. A monitor hitting this and getting anything other than 200 means
// "restart/reroute", nothing more nuanced than that.
healthRoutes.get("/live", (c) => ok(c, { status: "ok", timestamp: new Date().toISOString() }));

// Readiness: can this instance actually serve real traffic right now - the
// one thing worth checking is D1 connectivity, since every route depends
// on it. Deliberately minimal in what it returns publicly (no check
// breakdown, no environment name) - see GET /admin/system-health for the
// detailed, permission-gated view an operator actually investigates with.
healthRoutes.get("/ready", async (c) => {
  try {
    await c.env.DB.prepare("select 1 as ok").first();
  } catch (error) {
    getLogger(c.env).error(OBSERVABILITY_EVENTS.databaseQueryFailed, {
      requestId: c.get("requestId"),
      route: "/api/v1/health/ready",
      error
    });
    return fail(c, 503, "SERVICE_UNAVAILABLE", "The API is not ready to serve traffic.");
  }
  return ok(c, { status: "ok", timestamp: new Date().toISOString() });
});
