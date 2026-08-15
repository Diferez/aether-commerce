"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, CheckCircle2, ExternalLink, HelpCircle, RefreshCw, Search, ShieldAlert, XCircle } from "lucide-react";
import { Skeleton } from "@aether/ui";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState } from "../../components/ErrorState";

type HealthLevel = "operational" | "degraded" | "critical" | "unknown";
type ComponentStatus = { level: HealthLevel; reason?: string };

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
    avgLatencyMs: number | null;
    lastCriticalTask: { name: string; lastRunAt: string; status: "ok" | "failed" } | null;
  };
  timestamp: string;
};

const AUTO_REFRESH_MS = 60_000;

const levelMeta: Record<HealthLevel, { label: string; dot: string; icon: typeof CheckCircle2; text: string }> = {
  operational: { label: "Operational", dot: "bg-success", icon: CheckCircle2, text: "text-success" },
  degraded: { label: "Degraded", dot: "bg-warning", icon: AlertTriangle, text: "text-warning" },
  critical: { label: "Critical", dot: "bg-danger", icon: XCircle, text: "text-danger" },
  unknown: { label: "No data", dot: "bg-ink-subtle", icon: HelpCircle, text: "text-ink-subtle" }
};

const componentMeta: Array<{ key: keyof SystemHealthData["components"]; label: string; tooltip: string }> = [
  { key: "errors", label: "Errors", tooltip: "Unexpected application errors reported to Sentry, counted over the last 24h (an absolute count, not a rate - no request-volume baseline is tracked)." },
  { key: "latency", label: "Latency", tooltip: "Approximate average response time for admin routes, sampled at a low rate over the last hour. Not a true p95 percentile." },
  { key: "webhooks", label: "Webhooks", tooltip: "Flags when recent Stripe/Clerk webhook deliveries have failed to process, most recent first." },
  { key: "orders", label: "Orders", tooltip: "Flags a paid order stuck unfulfilled past the expected window, or (when detectable) a payment with no matching local order." },
  { key: "inventory", label: "Inventory", tooltip: "Flags any product with negative stock - should never happen; always indicates a real bug if it does." },
  { key: "security", label: "Security", tooltip: "Flags a burst of failed admin permission checks in the last hour - could be a misconfigured integration or a real intrusion attempt." },
  { key: "scheduledTasks", label: "Scheduled tasks", tooltip: "Flags when a critical background task (e.g. expiring stale cart reservations) hasn't run within its expected window." }
];

function StatusDot({ level }: { level: HealthLevel }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${levelMeta[level].dot}`} aria-hidden />;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleString();
}

export default function SystemHealthPage() {
  const { getToken } = useAuth();
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
        <PageHeader title="System health" description="An operational summary - not a copy of Sentry. See below for a link to the full error tracker." />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
          {status === "loading" && !data ? (
            <Skeleton className="h-8 w-48" />
          ) : status === "error" && !data ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-danger">
              <AlertTriangle size={16} aria-hidden /> Could not load system health
            </p>
          ) : data && overall && OverallIcon ? (
            <div className="flex items-center gap-2.5">
              <OverallIcon size={22} aria-hidden className={overall.text} />
              <div>
                <p className={`text-lg font-semibold ${overall.text}`}>{overall.label}</p>
                <p className="text-xs text-ink-subtle">Updated {formatRelativeTime(data.timestamp)}</p>
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
                Open Sentry <ExternalLink size={14} aria-hidden />
              </a>
            ) : null}
            <button
              type="button"
              onClick={refreshNow}
              disabled={status === "loading"}
              aria-label="Refresh now"
              className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={14} aria-hidden className={status === "loading" ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        {status === "error" && !data ? (
          <ErrorState title="Could not load system health" description="Try refreshing. If this keeps happening, check the API directly." />
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
                        <StatusDot level={component.level} />
                        {label}
                      </p>
                      <span className={`text-xs font-semibold uppercase tracking-wide ${meta.text}`}>{meta.label}</span>
                    </div>
                    <p className="mt-2 text-xs text-ink-subtle [overflow-wrap:anywhere]">{component.reason ?? "Nothing to report."}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">Errors (24h)</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.errors24h}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">Webhooks failed (24h)</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.webhooksFailed24h}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">Payments failed (24h)</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.paymentsFailed24h}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">Blocked orders</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.blockedOrdersCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">Negative inventory</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.negativeInventoryCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">Failed admin attempts (1h)</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.adminFailedAttempts1h}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">Avg. admin latency</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.stats.avgLatencyMs !== null ? `${Math.round(data.stats.avgLatencyMs)}ms` : "No data"}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-ink-subtle">Last critical task</p>
                {data.stats.lastCriticalTask ? (
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink">
                    {data.stats.lastCriticalTask.status === "ok" ? (
                      <CheckCircle2 size={14} aria-hidden className="text-success" />
                    ) : (
                      <ShieldAlert size={14} aria-hidden className="text-danger" />
                    )}
                    {formatRelativeTime(data.stats.lastCriticalTask.lastRunAt)}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-ink-subtle">Never run yet</p>
                )}
              </div>
            </div>
          </>
        )}

        <form onSubmit={jumpToAudit} className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-4">
          <label htmlFor="jump-to-audit" className="text-sm font-semibold text-ink">
            Investigate a request
          </label>
          <input
            id="jump-to-audit"
            value={requestIdSearch}
            onChange={(event) => setRequestIdSearch(event.target.value)}
            placeholder="Paste a request ID"
            className="focus-ring min-h-10 min-w-[220px] flex-1 rounded-md border border-border bg-bg px-3 text-sm text-ink"
          />
          <button
            type="submit"
            className="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            <Search size={14} aria-hidden /> Find in Activity
          </button>
        </form>
      </main>
    </RequireAdminAuth>
  );
}
