import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppBindings } from "./types";
import { auth } from "./middleware/auth";
import { aetherCors } from "./middleware/cors";
import { errorBoundary } from "./middleware/errors";
import { latencySampling } from "./middleware/latency-sampling";
import { rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { fail, ok } from "./http";
import { accountRoutes } from "./routes/account";
import { adminRoutes } from "./routes/admin";
import { adminChatRoutes } from "./routes/admin-chat";
import { cartRoutes } from "./routes/cart";
import { catalogRoutes } from "./routes/catalog";
import { checkoutRoutes } from "./routes/checkout";
import { contactRoutes } from "./routes/contact";
import { healthRoutes } from "./routes/health";
import { clerkPublishableKey, publicRoutes } from "./routes/public";
import { userRoutes } from "./routes/user";
import { webhookRoutes } from "./routes/webhooks";
import { getLogger } from "./services/observability";

// Everything an API Worker's fetch handler needs, minus deployment-specific
// wrapping (Sentry, the cron scheduled() handler) - those stay app-owned
// since they differ per deployment. See apps/api/src/index.ts for the
// reference deployment's own wrapping.
export function createApiApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // app.onError, not app.use("*", ...) - Hono's compose() resolves a thrown
  // error via the app's registered error handler at the innermost dispatch
  // level, before it can ever reach an outer middleware's own try/catch (see
  // errorBoundary's own comment and errors.test.ts). onError is the only
  // registration that actually sees every error, from every route/middleware.
  app.onError(errorBoundary());
  app.use("*", requestId());
  app.use("*", secureHeaders());
  app.use("*", aetherCors());
  app.use("*", auth());
  app.use("*", rateLimit());

  app.get("/", (c) => ok(c, { name: `${c.env.BRAND_NAME ?? "Aether"} API`, version: "v1", basePath: "/api/v1" }));

  const api = new Hono<AppBindings>().basePath("/api/v1");
  api.get("/runtime-config", (c) => {
    c.header("Cache-Control", "public, max-age=300, s-maxage=300");
    return ok(c, {
      clerkPublishableKey: clerkPublishableKey(c.env.CLERK_JWT_ISSUER, c.env.CLERK_SECRET_KEY)
    });
  });

  api.get("/health", async (c) => {
    const time = new Date().toISOString();
    try {
      await c.env.DB.prepare("select 1 as ok").first();
    } catch (error) {
      getLogger(c.env).error("database.query_failed", {
        requestId: c.get("requestId"),
        route: "/api/v1/health",
        error
      });
      return fail(c, 503, "SERVICE_UNAVAILABLE", "The API is not ready to serve traffic.", {
        status: "degraded",
        time
      });
    }

    return ok(c, {
      status: "ok",
      time
    });
  });
  api.route("/health", healthRoutes);
  api.use("/catalog/*", latencySampling("catalog"));
  api.route("/catalog", catalogRoutes);
  api.route("/", publicRoutes);
  api.route("/", userRoutes);
  api.route("/cart", cartRoutes);
  api.use("/checkout/*", latencySampling("checkout"));
  api.route("/checkout", checkoutRoutes);
  api.route("/contact", contactRoutes);
  api.use("/admin/*", latencySampling("admin"));
  api.route("/admin", adminRoutes);
  api.route("/admin/chat", adminChatRoutes);
  api.route("/account", accountRoutes);
  api.route("/webhooks", webhookRoutes);

  app.route("/", api);

  return app;
}
