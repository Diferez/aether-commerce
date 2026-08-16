"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { Check, ClipboardCopy, Code2 } from "lucide-react";
import { Sheet } from "@aether/ui";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";
import { PageHeader } from "../../components/PageHeader";
import { TableToolbar } from "../../components/TableToolbar";
import { FilterBar, type FilterChip } from "../../components/FilterBar";
import { DataTable, type Column } from "../../components/DataTable";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { useAdminLanguage } from "../../components/AdminLanguageProvider";
import type { AdminDictionary } from "@aether/i18n";

type AuditLogRow = {
  id: string;
  actor_id: string;
  actor_role: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  payload_json: string;
  previous_data: string | null;
  new_data: string | null;
  request_id: string | null;
  created_at: string;
};

type ListResponse = {
  data: AuditLogRow[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};

type Filters = { actorId: string; action: string; targetType: string; requestId: string; from: string; to: string; page: number };

// Same window.location.search pattern as app/inventory/page.tsx and
// app/products/page.tsx - required because output: "export" (static,
// Cloudflare Pages) can't use next/navigation's useSearchParams() without a
// Suspense boundary.
function readFiltersFromUrl(): Filters {
  if (typeof window === "undefined") return { actorId: "", action: "", targetType: "", requestId: "", from: "", to: "", page: 1 };
  const params = new URLSearchParams(window.location.search);
  return {
    actorId: params.get("actorId") ?? "",
    action: params.get("action") ?? "",
    targetType: params.get("targetType") ?? "",
    requestId: params.get("requestId") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    page: Number(params.get("page")) || 1
  };
}

function humanizeAction(action: string): string {
  const [subject, ...rest] = action.split(".");
  const verb = rest.join(" ").replaceAll("_", " ");
  const label = `${subject} ${verb}`.trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function summarizeChange(entry: AuditLogRow, t: AdminDictionary): string {
  const previous = parseJson(entry.previous_data);
  const next = parseJson(entry.new_data);
  if (next) {
    const fields = Object.keys(next);
    if (fields.length === 0) return previous ? t.activityPage.noFieldsChanged : "—";
    const fieldsText = `${fields.slice(0, 3).join(", ")}${fields.length > 3 ? "…" : ""}`;
    return (fields.length === 1 ? t.activityPage.fieldsChangedOne : t.activityPage.fieldsChangedOther)
      .replace("{count}", String(fields.length))
      .replace("{fields}", fieldsText);
  }
  const payload = parseJson(entry.payload_json);
  const payloadFields = payload ? Object.keys(payload) : [];
  return payloadFields.length > 0 ? payloadFields.slice(0, 3).join(", ") : "—";
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function CopyRequestId({ requestId }: { requestId: string }) {
  const { t } = useAdminLanguage();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser - the id is still
      // visible as text, so this is a convenience failure, not a blocker.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={t.activityPage.copyRequestId.replace("{id}", requestId)}
      className="focus-ring inline-flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 font-mono text-xs text-ink-muted hover:bg-surface-hover hover:text-ink"
    >
      {copied ? <Check size={12} aria-hidden /> : <ClipboardCopy size={12} aria-hidden />}
      {requestId}
    </button>
  );
}

function DiffTable({ entry }: { entry: AuditLogRow }) {
  const { t } = useAdminLanguage();
  const previous = parseJson(entry.previous_data);
  const next = parseJson(entry.new_data);

  if (!previous && !next) {
    const payload = parseJson(entry.payload_json);
    if (!payload || Object.keys(payload).length === 0) {
      return <p className="text-sm text-ink-subtle">{t.activityPage.noAdditionalDetail}</p>;
    }
    return (
      <dl className="grid gap-2">
        {Object.entries(payload).map(([key, value]) => (
          <div key={key} className="rounded-md border border-border px-3 py-2">
            <dt className="text-xs uppercase tracking-wide text-ink-subtle">{key}</dt>
            <dd className="mt-0.5 text-sm text-ink [overflow-wrap:anywhere]">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  const fields = new Set([...Object.keys(previous ?? {}), ...Object.keys(next ?? {})]);
  if (fields.size === 0) {
    return <p className="text-sm text-ink-subtle">{t.activityPage.nothingChanged}</p>;
  }

  return (
    <div className="grid gap-2">
      {[...fields].map((field) => (
        <div key={field} className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <p className="text-xs uppercase tracking-wide text-ink-subtle">{field}</p>
            <p className="mt-0.5 text-danger line-through">{formatValue((previous ?? {})[field])}</p>
          </div>
          <span className="mt-4 text-ink-subtle" aria-hidden>
            →
          </span>
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <p className="text-xs uppercase tracking-wide text-ink-subtle">&nbsp;</p>
            <p className="mt-0.5 font-medium text-success">{formatValue((next ?? {})[field])}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditDetailSheet({ entry, onClose }: { entry: AuditLogRow | null; onClose: () => void }) {
  const { t, locale } = useAdminLanguage();
  const [showRaw, setShowRaw] = useState(false);

  return (
    <Sheet open={Boolean(entry)} onClose={onClose} side="right" {...(entry ? { title: humanizeAction(entry.action) } : {})} width="min(480px,100vw)">
      {entry ? (
        <div className="grid gap-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-subtle">{t.activityPage.colWhen}</dt>
              <dd className="mt-0.5 text-ink">{new Date(entry.created_at.replace(" ", "T") + "Z").toLocaleString(locale === "es" ? "es-ES" : "en-US")}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-subtle">{t.activityPage.colAdmin}</dt>
              <dd className="mt-0.5 font-mono text-xs text-ink [overflow-wrap:anywhere]">
                {entry.actor_id}
                {entry.actor_role ? <span className="ml-1 text-ink-subtle">({entry.actor_role})</span> : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-subtle">{t.activityPage.colEntity}</dt>
              <dd className="mt-0.5 text-ink [overflow-wrap:anywhere]">
                {entry.target_type}
                {entry.target_id ? <span className="text-ink-subtle"> · {entry.target_id}</span> : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-subtle">{t.activityPage.colRequestId}</dt>
              <dd className="mt-0.5">{entry.request_id ? <CopyRequestId requestId={entry.request_id} /> : <span className="text-ink-subtle">—</span>}</dd>
            </div>
          </dl>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{t.activityPage.whatChanged}</p>
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="focus-ring inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink hover:underline"
              >
                <Code2 size={12} aria-hidden />
                {showRaw ? t.activityPage.hideRawJson : t.activityPage.viewRawJson}
              </button>
            </div>
            {showRaw ? (
              <pre className="overflow-x-auto rounded-md border border-border bg-surface-hover p-3 text-xs text-ink-muted">
                {JSON.stringify(
                  { payload: parseJson(entry.payload_json), previous: parseJson(entry.previous_data), next: parseJson(entry.new_data) },
                  null,
                  2
                )}
              </pre>
            ) : (
              <DiffTable entry={entry} />
            )}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

export default function ActivityPage() {
  const { getToken } = useAuth();
  const { t, locale } = useAdminLanguage();
  const [filters, setFilters] = useState<Filters>(() => readFiltersFromUrl());
  const [requestIdInput, setRequestIdInput] = useState(filters.requestId);
  const [result, setResult] = useState<ListResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const authHeader = useCallback(async () => {
    const token = await getToken().catch(() => null);
    return token ? { authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const load = useCallback(async () => {
    setStatus("loading");
    const params = new URLSearchParams();
    if (filters.actorId) params.set("actorId", filters.actorId);
    if (filters.action) params.set("action", filters.action);
    if (filters.targetType) params.set("targetType", filters.targetType);
    if (filters.requestId) params.set("requestId", filters.requestId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    params.set("page", String(filters.page));
    params.set("pageSize", "25");

    window.history.replaceState(null, "", `?${params.toString()}`);

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/audit?${params.toString()}`, { headers: await authHeader() });
      const payload = (await response.json()) as { success: boolean; data?: AuditLogRow[]; pagination?: ListResponse["pagination"] };
      if (!payload.success || !payload.data || !payload.pagination) {
        setStatus("error");
        return;
      }
      setResult({ data: payload.data, pagination: payload.pagination });
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [filters, authHeader]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value, page: key === "page" ? (value as number) : 1 }));
  }

  function submitRequestId(event: React.FormEvent) {
    event.preventDefault();
    updateFilter("requestId", requestIdInput.trim());
  }

  const hasFilters = Boolean(filters.actorId || filters.action || filters.targetType || filters.requestId || filters.from || filters.to);
  const chips: FilterChip[] = useMemo(() => {
    const list: FilterChip[] = [];
    if (filters.actorId) list.push({ key: "actorId", label: t.activityPage.adminChip.replace("{value}", filters.actorId), onRemove: () => updateFilter("actorId", "") });
    if (filters.action) list.push({ key: "action", label: t.activityPage.actionChip.replace("{value}", filters.action), onRemove: () => updateFilter("action", "") });
    if (filters.targetType) list.push({ key: "targetType", label: t.activityPage.entityChip.replace("{value}", filters.targetType), onRemove: () => updateFilter("targetType", "") });
    if (filters.requestId) {
      list.push({
        key: "requestId",
        label: t.activityPage.requestChip.replace("{value}", filters.requestId),
        onRemove: () => {
          setRequestIdInput("");
          updateFilter("requestId", "");
        }
      });
    }
    if (filters.from) list.push({ key: "from", label: t.activityPage.fromChip.replace("{value}", filters.from), onRemove: () => updateFilter("from", "") });
    if (filters.to) list.push({ key: "to", label: t.activityPage.toChip.replace("{value}", filters.to), onRemove: () => updateFilter("to", "") });
    return list;
  }, [filters, t]);

  function clearAll() {
    setRequestIdInput("");
    setFilters((current) => ({ ...current, actorId: "", action: "", targetType: "", requestId: "", from: "", to: "", page: 1 }));
  }

  const columns: Column<AuditLogRow>[] = [
    {
      key: "when",
      header: t.activityPage.colWhen,
      render: (entry) => <span className="whitespace-nowrap text-xs text-ink-subtle">{new Date(entry.created_at.replace(" ", "T") + "Z").toLocaleString(locale === "es" ? "es-ES" : "en-US")}</span>
    },
    {
      key: "actor",
      header: t.activityPage.colAdmin,
      render: (entry) => (
        <span className="font-mono text-xs text-ink-muted [overflow-wrap:anywhere]">
          {entry.actor_id}
          {entry.actor_role ? <span className="ml-1 text-ink-subtle">({entry.actor_role})</span> : null}
        </span>
      )
    },
    {
      key: "action",
      header: t.activityPage.colAction,
      render: (entry) => (
        <button type="button" onClick={() => setSelected(entry)} className="focus-ring text-left font-medium text-ink hover:underline">
          {humanizeAction(entry.action)}
        </button>
      )
    },
    {
      key: "entity",
      header: t.activityPage.colEntity,
      hideBelow: "sm",
      render: (entry) => (
        <span className="text-ink-muted [overflow-wrap:anywhere]">
          {entry.target_type}
          {entry.target_id ? <span className="text-ink-subtle"> · {entry.target_id}</span> : null}
        </span>
      )
    },
    { key: "summary", header: t.activityPage.colChange, hideBelow: "sm", render: (entry) => <span className="text-ink-muted [overflow-wrap:anywhere]">{summarizeChange(entry, t)}</span> },
    {
      key: "requestId",
      header: t.activityPage.colRequestId,
      hideBelow: "sm",
      render: (entry) => (entry.request_id ? <CopyRequestId requestId={entry.request_id} /> : <span className="text-ink-subtle">—</span>)
    }
  ];

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader
          title={t.activityPage.title}
          description={result ? (result.pagination.total === 1 ? t.activityPage.countOne : t.activityPage.countOther).replace("{count}", String(result.pagination.total)) : t.activityPage.loading}
        />

        <TableToolbar
          searchValue={requestIdInput}
          onSearchChange={setRequestIdInput}
          onSearchSubmit={submitRequestId}
          searchPlaceholder={t.activityPage.searchPlaceholder}
          searchLabel={t.activityPage.searchLabel}
          filters={
            <>
              <input
                value={filters.actorId}
                onChange={(event) => updateFilter("actorId", event.target.value)}
                placeholder={t.activityPage.adminIdPlaceholder}
                aria-label={t.activityPage.filterByAdminId}
                className="focus-ring min-h-11 w-32 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              />
              <input
                value={filters.action}
                onChange={(event) => updateFilter("action", event.target.value)}
                placeholder={t.activityPage.actionPlaceholder}
                aria-label={t.activityPage.filterByAction}
                className="focus-ring min-h-11 w-48 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              />
              <input
                value={filters.targetType}
                onChange={(event) => updateFilter("targetType", event.target.value)}
                placeholder={t.activityPage.entityTypePlaceholder}
                aria-label={t.activityPage.filterByEntityType}
                className="focus-ring min-h-11 w-32 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              />
              <input
                type="date"
                value={filters.from}
                onChange={(event) => updateFilter("from", event.target.value)}
                aria-label={t.activityPage.fromDateLabel}
                className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              />
              <input
                type="date"
                value={filters.to}
                onChange={(event) => updateFilter("to", event.target.value)}
                aria-label={t.activityPage.toDateLabel}
                className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              />
            </>
          }
        />
        <FilterBar chips={chips} onClearAll={clearAll} />

        <DataTable<AuditLogRow>
          columns={columns}
          rows={result?.data ?? []}
          status={status}
          getRowId={(entry) => entry.id}
          pagination={result?.pagination ?? null}
          onPageChange={(page) => updateFilter("page", page)}
          errorState={<ErrorState title={t.activityPage.couldNotLoad} />}
          emptyState={
            <EmptyState
              title={hasFilters ? t.activityPage.noEventsMatchFilters : t.activityPage.noActivityYet}
              description={hasFilters ? t.activityPage.tryAdjustingFilters : t.activityPage.noActivityDescription}
            />
          }
        />

        <AuditDetailSheet entry={selected} onClose={() => setSelected(null)} />
      </main>
    </RequireAdminAuth>
  );
}
