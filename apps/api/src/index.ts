import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { withSentry } from "@sentry/cloudflare";
import type { AppBindings, Env } from "./types";
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
import { buildSentryOptions, getLogger } from "./services/observability";
import { recordTaskRun } from "./services/metrics";

const app = new Hono<AppBindings>();

function retentionDays(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(730, Math.max(7, Math.round(parsed))) : fallback;
}

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

app.get("/", (c) => ok(c, { name: "Aether API", version: "v1", basePath: "/api/v1" }));

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

// withSentry initializes the Sentry client fresh per-request from real env
// bindings (buildSentryOptions returns undefined - skipping initialization
// entirely - whenever SENTRY_ENABLED isn't "true" or SENTRY_DSN is unset,
// so this is a no-op by default in every environment until both are
// configured) and instruments fetch automatically.
export default withSentry(buildSentryOptions, {
  fetch: app.fetch,
  // Reservations are only ever a hold, not the real stock number - an
  // active row past its expires_at just means the shopper never checked
  // out, so it stops counting against "available to sell" for everyone else.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- ctx must be declared so withSentry's real 3-arg ExecutionContext type is preserved (see index.test.ts)
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    try {
      const metricsDays = retentionDays(env.HEALTH_METRICS_RETENTION_DAYS, 90);
      await env.DB.batch([
        env.DB.prepare(
          "update inventory_reservations set status = 'expired', updated_at = CURRENT_TIMESTAMP where status = 'active' and expires_at < ?"
        ).bind(new Date().toISOString()),
        env.DB.prepare("update checkout_snapshots set status = 'expired', updated_at = CURRENT_TIMESTAMP where status = 'active' and expires_at <= CURRENT_TIMESTAMP"),
        env.DB.prepare("delete from checkout_snapshots where status != 'active' and updated_at <= datetime('now', '-30 days')"),
        env.DB.prepare("delete from webhook_events where created_at <= datetime('now', '-90 days')"),
        env.DB.prepare("delete from operational_metrics where created_at <= datetime('now', ?)").bind(`-${metricsDays} days`),
        env.DB.prepare("delete from audit_logs where created_at <= datetime('now', '-365 days')"),
        env.DB.prepare(
          "delete from admin_chat_pending_actions where conversation_id in (select id from admin_chat_conversations where updated_at <= datetime('now', '-30 days'))"
        ),
        env.DB.prepare(
          "delete from admin_chat_messages where conversation_id in (select id from admin_chat_conversations where updated_at <= datetime('now', '-30 days'))"
        ),
        env.DB.prepare("delete from admin_chat_conversations where updated_at <= datetime('now', '-30 days')")
      ]);
      // "System health" reads this back to flag a critical task that's gone
      // stale (see health-status.ts's scheduledTasks component) - recorded
      // regardless of whether any row actually needed expiring.
      await recordTaskRun(env, "inventory_reservation_expiry", "ok");
    } catch (error) {
      await recordTaskRun(env, "inventory_reservation_expiry", "failed", error instanceof Error ? error.message.slice(0, 200) : "Unknown error");
      throw error;
    }
  }
} satisfies ExportedHandler<Env>);
