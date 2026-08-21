import type { Env } from "../types";

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
