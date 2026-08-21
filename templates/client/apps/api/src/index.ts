import { withSentry } from "@sentry/cloudflare";
import {
  buildSentryOptions,
  createApiApp,
  recordTaskRun,
  runScheduledMaintenance,
  sendDueRestockNotifications,
  sendLowStockAlerts,
  type Env
} from "@aether/api-worker";

const app = createApiApp();

// withSentry initializes the Sentry client fresh per-request from real env
// bindings (buildSentryOptions returns undefined - skipping initialization
// entirely - whenever SENTRY_ENABLED isn't "true" or SENTRY_DSN is unset,
// so this is a no-op by default in every environment until both are
// configured) and instruments fetch automatically.
export default withSentry(buildSentryOptions, {
  fetch: app.fetch,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- ctx must be declared so withSentry's real 3-arg ExecutionContext type is preserved
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    try {
      await runScheduledMaintenance(env);
      // "System health" reads this back to flag a critical task that's gone
      // stale - recorded regardless of whether any row actually needed
      // expiring.
      await recordTaskRun(env, "inventory_reservation_expiry", "ok");
    } catch (error) {
      await recordTaskRun(env, "inventory_reservation_expiry", "failed", error instanceof Error ? error.message.slice(0, 200) : "Unknown error");
      throw error;
    }

    try {
      await sendDueRestockNotifications(env);
      await recordTaskRun(env, "restock_notifications", "ok");
    } catch (error) {
      await recordTaskRun(env, "restock_notifications", "failed", error instanceof Error ? error.message.slice(0, 200) : "Unknown error");
      throw error;
    }

    try {
      await sendLowStockAlerts(env);
      await recordTaskRun(env, "low_stock_alerts", "ok");
    } catch (error) {
      await recordTaskRun(env, "low_stock_alerts", "failed", error instanceof Error ? error.message.slice(0, 200) : "Unknown error");
      throw error;
    }
  }
} satisfies ExportedHandler<Env>);
