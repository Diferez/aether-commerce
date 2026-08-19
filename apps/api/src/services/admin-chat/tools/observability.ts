import { z } from "zod";
import { formatDurationMinutes } from "@aether/core";
import { defineAdminChatTool } from "../define-tool";
import { computeSystemHealth } from "../../system-health";
import { listRecentWebhookEvents } from "../../webhooks";
import { pick } from "../language";
import type { ActivityItemArtifact, OrderSummaryArtifact } from "../artifacts";

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
    const issues: { name: string; level: "critical" | "degraded"; reason: string }[] = Object.entries(snapshot.components)
      .filter((entry): entry is [string, { level: "critical" | "degraded"; reason?: string }] => entry[1].level === "critical" || entry[1].level === "degraded")
      .map(([name, component]) => ({ name, level: component.level, reason: component.reason ?? pick(ctx.language, "no detail", "sin detalle") }));

    const relatedOrders: OrderSummaryArtifact[] = snapshot.stats.blockedOrders.map((order) => ({
      id: order.id,
      number: order.number,
      email: order.email,
      state: order.state,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      totalCents: order.totalCents,
      currency: order.currency,
      createdAt: order.createdAt,
      href: order.href
    }));

    // Named explicitly (not just "N orders are blocked") so the model can
    // answer "which order?" verbatim instead of falling back to a generic
    // explanation of what the alert type usually means.
    const blockedOrderDetail = snapshot.stats.blockedOrders
      .map(
        (order) =>
          `- ${order.number}: ${(order.totalCents / 100).toFixed(2)} ${order.currency}, ${order.email}, ${pick(ctx.language, "unfulfilled for", "sin surtir desde hace")} ${formatDurationMinutes(order.blockedMinutes)} (id ${order.id})`
      )
      .join("\n");

    const message = pick(
      ctx.language,
      issues.length === 0
        ? `System status: ${snapshot.status}. No components are flagged.`
        : `System status: ${snapshot.status}. ${issues.length} component(s) need attention:\n${issues.map((issue) => `- ${issue.name} (${issue.level}): ${issue.reason}`).join("\n")}` +
          (snapshot.stats.blockedOrders.length > 0 ? `\n\nBlocked order(s):\n${blockedOrderDetail}` : ""),
      issues.length === 0
        ? `Estado del sistema: ${snapshot.status}. Ningún componente está marcado.`
        : `Estado del sistema: ${snapshot.status}. ${issues.length} componente(s) necesitan atención:\n${issues.map((issue) => `- ${issue.name} (${issue.level}): ${issue.reason}`).join("\n")}` +
          (snapshot.stats.blockedOrders.length > 0 ? `\n\nPedido(s) bloqueado(s):\n${blockedOrderDetail}` : "")
    );

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
            : pick(ctx.language, "never run", "nunca se ejecutó")
        },
        ...(issues.length > 0 ? { issues } : {}),
        ...(relatedOrders.length > 0 ? { relatedOrders } : {}),
        // The card (status badge, issues, stat grid, related orders) already
        // fully represents this - showing the raw message too would just
        // repeat the same data less legibly, ids and all. message itself
        // stays as-is: the model still needs the full detail (exact ids,
        // durations) to act on a follow-up like "change it to processing".
        displayMessage: ""
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
      // No human actor exists for a webhook delivery - actorId is already the
      // provider name (e.g. "stripe"), which the card's actor clause
      // recognizes as an automated actor without needing a role here.
      actorRole: null,
      createdAt: row.received_at
    }));

    const failed = rows.filter((row) => row.status === "failed");
    const failedSummary = failed
      .slice(0, 5)
      .map(
        (row) =>
          `${row.provider}/${row.provider_event_id} - ${row.error_code ?? pick(ctx.language, "unknown error", "error desconocido")}: ${row.error_message ?? pick(ctx.language, "no detail recorded", "sin detalle registrado")} (${row.attempts} ${pick(ctx.language, "attempt(s)", "intento(s)")})`
      )
      .join("\n");

    const message = pick(
      ctx.language,
      rows.length === 0
        ? "No webhook deliveries match that filter."
        : failed.length === 0
          ? `${rows.length} recent webhook event(s), none failed.`
          : `${rows.length} recent webhook event(s), ${failed.length} failed:\n${failedSummary}`,
      rows.length === 0
        ? "Ningún webhook coincide con ese filtro."
        : failed.length === 0
          ? `${rows.length} evento(s) de webhook reciente(s), ninguno falló.`
          : `${rows.length} evento(s) de webhook reciente(s), ${failed.length} fallaron:\n${failedSummary}`
    );

    return { message, artifact: { type: "activity_list", items } };
  }
});
