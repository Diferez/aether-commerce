import type { Env } from "../types";
import { recordTaskRun } from "./metrics";
import { sendDueRestockNotifications } from "./restock-notifications";
import { sendLowStockAlerts } from "./low-stock-alerts";

function retentionDays(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(730, Math.max(7, Math.round(parsed))) : fallback;
}

// Reservations are only ever a hold, not the real stock number - an active
// row past its expires_at just means the shopper never checked out, so it
// stops counting against "available to sell" for everyone else.
export async function runScheduledMaintenance(env: Env): Promise<void> {
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
}

// The cron entrypoint every deployment's own scheduled() handler should call
// - each task is independent (no ordering requirement between them) and its
// outcome is recorded under its own task name regardless of whether the
// others succeeded, so "System health" can flag exactly which one went
// stale rather than just "the cron failed".
export async function runScheduledTasks(env: Env): Promise<void> {
  try {
    await runScheduledMaintenance(env);
    // "System health" reads this back to flag a critical task that's gone
    // stale (see health-status.ts's scheduledTasks component) - recorded
    // regardless of whether any row actually needed expiring.
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
