"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, CheckCircle2, ExternalLink, HelpCircle, RefreshCw, Search, ShieldAlert, XCircle } from "lucide-react";
import { Skeleton } from "@aether/ui";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState } from "../../components/ErrorState";
import { money, fulfillmentTone } from "../../components/AdminChat/format";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDurationMinutes } from "@aether/core";
import { useAdminLanguage } from "../../components/AdminLanguageProvider";
import type { AdminDictionary } from "@aether/i18n";

type HealthLevel = "operational" | "degraded" | "critical" | "unknown";
type ComponentStatus = { level: HealthLevel; reason?: string };

type BlockedOrderSummary = {
  id: string;
  number: string;
  email: string;
  state: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  blockedMinutes: number;
  href: string;
};

type SystemHealthData = {
  status: HealthLevel;
  components: {
    errors: ComponentStatus;
    latency: ComponentStatus;
    webhooks: ComponentStatus;
    orders: ComponentStatus;
    inventory: ComponentStatus;
    security: ComponentStatus;
    scheduledTasks: ComponentStatus;
  };
  stats: {
    errors24h: number;
    webhooksFailed24h: number;
    paymentsFailed24h: number;
    adminFailedAttempts1h: number;
    negativeInventoryCount: number;
    blockedOrdersCount: number;
    blockedOrders: BlockedOrderSummary[];
    avgLatencyMs: number | null;
    lastCriticalTask: { name: string; lastRunAt: string; status: "ok" | "failed" } | null;
  };
  timestamp: string;
};

const AUTO_REFRESH_MS = 60_000;

function getLevelMeta(t: AdminDictionary): Record<HealthLevel, { label: string; dot: string; icon: typeof CheckCircle2; text: string }> {
  return {
    operational: { label: t.systemHealthPage.levelOperational, dot: "bg-success", icon: CheckCircle2, text: "text-success" },
    degraded: { label: t.systemHealthPage.levelDegraded, dot: "bg-warning", icon: AlertTriangle, text: "text-warning" },
    critical: { label: t.systemHealthPage.levelCritical, dot: "bg-danger", icon: XCircle, text: "text-danger" },
    unknown: { label: t.systemHealthPage.statNoData, dot: "bg-ink-subtle", icon: HelpCircle, text: "text-ink-subtle" }
  };
}

function getComponentMeta(t: AdminDictionary): Array<{ key: keyof SystemHealthData["components"]; label: string; tooltip: string }> {
  return [
    { key: "errors", label: t.systemHealthPage.componentErrors, tooltip: t.systemHealthPage.componentErrorsTooltip },
    { key: "latency", label: t.systemHealthPage.componentLatency, tooltip: t.systemHealthPage.componentLatencyTooltip },
    { key: "webhooks", label: t.systemHealthPage.componentWebhooks, tooltip: t.systemHealthPage.componentWebhooksTooltip },
    { key: "orders", label: t.systemHealthPage.componentOrders, tooltip: t.systemHealthPage.componentOrdersTooltip },
    { key: "inventory", label: t.systemHealthPage.componentInventory, tooltip: t.systemHealthPage.componentInventoryTooltip },
    { key: "security", label: t.systemHealthPage.componentSecurity, tooltip: t.systemHealthPage.componentSecurityTooltip },
    { key: "scheduledTasks", label: t.systemHealthPage.componentScheduledTasks, tooltip: t.systemHealthPage.componentScheduledTasksTooltip }
  ];
}

function StatusDot({ dot }: { dot: string }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />;
}

function formatRelativeTime(iso: string, t: AdminDictionary, locale: string): string {
  const date = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return t.systemHealthPage.justNow;
  if (minutes < 60) return t.systemHealthPage.minAgo.replace("{count}", String(minutes));
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t.systemHealthPage.hoursAgo.replace("{count}", String(hours));
  return date.toLocaleString(locale === "es" ? "es-ES" : "en-US");
}

function statusLabel(t: AdminDictionary, value: string) {
  const raw = t.orderStatus[value as keyof AdminDictionary["orderStatus"]] ?? value;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function SystemHealthPage() {
  const { getToken } = useAuth();
  const { t, locale } = useAdminLanguage();
  const levelMeta = useMemo(() => getLevelMeta(t), [t]);
  const componentMeta = useMemo(() => getComponentMeta(t), [t]);
  const [data, setData] = useState<SystemHealthData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [requestIdSearch, setRequestIdSearch] = useState("");

  const load = useCallback(async () => {
    const token = await getToken().catch(() => null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/system-health`, {
        headers: token ? { authorization: `Bearer ${token}` } : {}
      });
      const payload = (await response.json()) as { success: boolean; data?: SystemHealthData };
      if (!payload.success || !payload.data) {
        setStatus("error");
        return;
      }
      setData(payload.data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [getToken]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  function refreshNow() {
    setStatus((current) => (current === "ready" ? current : "loading"));
    void load();
  }

  function jumpToAudit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = requestIdSearch.trim();
    if (!trimmed) return;
    window.location.href = `/activity/?requestId=${encodeURIComponent(trimmed)}`;
  }

  const dashboardUrl = process.env.NEXT_PUBLIC_OBSERVABILITY_DASHBOARD_URL;
  const overall = data ? levelMeta[data.status] : null;
  const OverallIcon = overall?.icon;

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader title={t.systemHealthPage.title} description={t.systemHealthPage.description} />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
          {status === "loading" && !data ? (
            <Skeleton className="h-8 w-48" />
          ) : status === "error" && !data ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-danger">
              <AlertTriangle size={16} aria-hidden /> {t.systemHealthPage.couldNotLoad}
            </p>
          ) : data && overall && OverallIcon ? (
            <div className="flex items-center gap-2.5">
              <OverallIcon size={22} aria-hidden className={overall.text} />
              <div>
                <p className={`text-lg font-semibold ${overall.text}`}>{overall.label}</p>
                <p className="text-xs text-ink-subtle">{t.systemHealthPage.updatedAt.replace("{value}", formatRelativeTime(data.timestamp, t, locale))}</p>
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            {dashboardUrl ? (
              <a
                href={dashboardUrl}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                {t.systemHealthPage.openSentry} <ExternalLink size={14} aria-hidden />
              </a>
            ) : null}
            <button
              type="button"
              onClick={refreshNow}
              disabled={status === "loading"}
              aria-label={t.systemHealthPage.refreshNow}
              className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={14} aria-hidden className={status === "loading" ? "animate-spin" : ""} /> {t.systemHealthPage.refresh}
            </button>
          </div>
        </div>

        {status === "error" && !data ? (
          <ErrorState title={t.systemHealthPage.couldNotLoad} description={t.systemHealthPage.tryRefreshing} />
        ) : !data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {componentMeta.map(({ key, label, tooltip }) => {
                const component = data.components[key];
                const meta = levelMeta[component.level];
                return (
                  <div key={key} className="rounded-lg border border-border bg-surface p-4" title={tooltip}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <StatusDot dot={meta.dot} />
                        {label}
                      </p>
                      <span className={`text-xs font-semibold uppercase tracking-wide ${meta.text}`}>{meta.label}</span>
                    </div>
                    <p className="mt-2 text-xs text-ink-subtle [overflow-wrap:anywhere]">{component.reason ?? t.systemHealthPage.nothingToReport}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">{t.systemHealthPage.statErrors24h}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.errors24h}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">{t.systemHealthPage.statWebhooksFailed24h}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.webhooksFailed24h}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">{t.systemHealthPage.statPaymentsFailed24h}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.paymentsFailed24h}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">{t.systemHealthPage.statBlockedOrders}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.blockedOrdersCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">{t.systemHealthPage.statNegativeInventory}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.negativeInventoryCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">{t.systemHealthPage.statFailedAdminAttempts1h}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.adminFailedAttempts1h}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">{t.systemHealthPage.statAvgLatency}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.avgLatencyMs !== null ? `${Math.round(data.stats.avgLatencyMs)}ms` : t.systemHealthPage.statNoData}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">{t.systemHealthPage.statLastCriticalTask}</p>
                {data.stats.lastCriticalTask ? (
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink">
                    {data.stats.lastCriticalTask.status === "ok" ? (
                      <CheckCircle2 size={14} aria-hidden className="text-success" />
                    ) : (
                      <ShieldAlert size={14} aria-hidden className="text-danger" />
                    )}
                    {formatRelativeTime(data.stats.lastCriticalTask.lastRunAt, t, locale)}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-ink-subtle">{t.systemHealthPage.neverRunYet}</p>
                )}
              </div>
            </div>

            {data.stats.blockedOrders.length > 0 ? (
              <div className="mt-4 rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">
                  {data.stats.blockedOrders.length === 1 ? t.systemHealthPage.blockedOrdersOne : t.systemHealthPage.blockedOrdersOther}
                </p>
                <div className="mt-2 grid gap-1.5">
                  {data.stats.blockedOrders.map((order) => (
                    <a
                      key={order.id}
                      href={order.href}
                      className="focus-ring flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{order.number}</span>
                        <span className="block text-xs text-ink-subtle">
                          {t.systemHealthPage.unfulfilledFor.replace("{email}", order.email).replace("{duration}", formatDurationMinutes(order.blockedMinutes))}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums text-ink-muted">{money(order.totalCents, order.currency)}</span>
                        <StatusBadge tone={fulfillmentTone[order.fulfillmentStatus] ?? "neutral"}>{statusLabel(t, order.fulfillmentStatus)}</StatusBadge>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        <form onSubmit={jumpToAudit} className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-4">
          <label htmlFor="jump-to-audit" className="text-sm font-semibold text-ink">
            {t.systemHealthPage.investigateRequest}
          </label>
          <input
            id="jump-to-audit"
            value={requestIdSearch}
            onChange={(event) => setRequestIdSearch(event.target.value)}
            placeholder={t.systemHealthPage.requestIdPlaceholder}
            className="focus-ring min-h-10 min-w-[220px] flex-1 rounded-md border border-border bg-bg px-3 text-sm text-ink"
          />
          <button
            type="submit"
            className="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            <Search size={14} aria-hidden /> {t.systemHealthPage.findInActivity}
          </button>
        </form>
      </main>
    </RequireAdminAuth>
  );
}
