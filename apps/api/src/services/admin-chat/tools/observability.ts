import { z } from "zod";
import { formatDurationMinutes } from "@aether/core";
import { defineAdminChatTool } from "../define-tool";
import { computeSystemHealth } from "../../system-health";
import { listRecentWebhookEvents } from "../../webhooks";
import type { ActivityItemArtifact } from "../artifacts";

// Read-only visibility into the observability layer itself (System health,
// webhook processing) - lets the operator ask "why is this order flagged"
// or "did that webhook actually go through" in plain language instead of
// switching to the System health page or the Cloudflare dashboard.
// Reuses audit.read, matching GET /admin/system-health's own permission
// choice (see routes/admin.ts's comment on why no dedicated permission
// was introduced for this).
export const getSystemHealthTool = defineAdminChatTool({
  name: "get_system_health",
  description:
    "Gets the current operational status of the store: errors, webhook failures, payment failures, blocked orders, negative inventory, admin security events, and scheduled task staleness. Use this when asked about system health, why something is flagged as critical/degraded, or whether everything is working normally.",
  schema: z.object({}),
  requires: { permission: "audit.read" },
  run: async (_args, ctx) => {
    const snapshot = await computeSystemHealth(ctx.env);
    const issues = Object.entries(snapshot.components)
      .filter(([, component]) => component.level === "critical" || component.level === "degraded")
      .map(([name, component]) => `${name} (${component.level}): ${component.reason ?? "no detail"}`);

    const message =
      issues.length === 0
        ? `System status: ${snapshot.status}. No components are flagged.`
        : `System status: ${snapshot.status}. ${issues.length} component(s) need attention:\n${issues.map((issue) => `- ${issue}`).join("\n")}`;

    return {
      message,
      artifact: {
        type: "dashboard_summary",
        summary: {
          status: snapshot.status,
          errors24h: snapshot.stats.errors24h,
          webhooksFailed24h: snapshot.stats.webhooksFailed24h,
          paymentsFailed24h: snapshot.stats.paymentsFailed24h,
          adminFailedAttempts1h: snapshot.stats.adminFailedAttempts1h,
          negativeInventoryCount: snapshot.stats.negativeInventoryCount,
          blockedOrdersCount: snapshot.stats.blockedOrdersCount,
          avgLatencyMs: snapshot.stats.avgLatencyMs,
          lastCriticalTask: snapshot.stats.lastCriticalTask
            ? `${snapshot.stats.lastCriticalTask.status} (${formatDurationMinutes(
                Math.round((Date.now() - new Date(snapshot.stats.lastCriticalTask.lastRunAt.replace(" ", "T") + "Z").getTime()) / 60_000)
              )} ago)`
            : "never run"
        }
      }
    };
  }
});

export const getWebhookActivityTool = defineAdminChatTool({
  name: "get_webhook_activity",
  description:
    "Gets recent Stripe/Clerk webhook deliveries and their processing status (received, processing, processed, failed, retrying). Use this when asked whether a webhook or payment notification actually arrived and processed, or to investigate 'webhooks failed' shown in System health.",
  schema: z.object({
    status: z.enum(["received", "processing", "processed", "failed", "retrying", "ignored"]).optional(),
    provider: z.enum(["stripe", "clerk"]).optional(),
    limit: z.number().int().min(1).max(50).default(20)
  }),
  requires: { permission: "audit.read" },
  run: async (args, ctx) => {
    const rows = await listRecentWebhookEvents(ctx.env, { status: args.status, provider: args.provider, limit: args.limit });
    const items: ActivityItemArtifact[] = rows.map((row) => ({
      id: row.provider_event_id,
      action: `${row.provider}.${row.status}`,
      targetType: "webhook",
      targetId: row.provider_event_id,
      actorId: row.provider,
      createdAt: row.received_at
    }));

    const failed = rows.filter((row) => row.status === "failed");
    const failedSummary = failed
      .slice(0, 5)
      .map((row) => `${row.provider}/${row.provider_event_id} - ${row.error_code ?? "unknown error"}: ${row.error_message ?? "no detail recorded"} (${row.attempts} attempt(s))`)
      .join("\n");

    const message =
      rows.length === 0
        ? "No webhook deliveries match that filter."
        : failed.length === 0
          ? `${rows.length} recent webhook event(s), none failed.`
          : `${rows.length} recent webhook event(s), ${failed.length} failed:\n${failedSummary}`;

    return { message, artifact: { type: "activity_list", items } };
  }
});
