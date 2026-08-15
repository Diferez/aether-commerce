"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";
import { PageHeader } from "../../components/PageHeader";
import { TableToolbar } from "../../components/TableToolbar";
import { DataTable, type Column } from "../../components/DataTable";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";

type AuditLogEntry = {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  payload_json: string;
  created_at: string;
};

// GET /admin/audit has no server-side search or pagination - it returns the
// most recent 100 events as a flat array. Filtering here is client-side over
// that already-fetched set, not a new network call, so it doesn't invent a
// server contract that doesn't exist.
export default function ActivityPage() {
  const { getToken } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [targetType, setTargetType] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus("loading");
      const token = await getToken().catch(() => null);
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/admin/audit`, {
          headers: token ? { authorization: `Bearer ${token}` } : {}
        });
        if (cancelled) return;
        const payload = (await response.json()) as { success: boolean; data?: AuditLogEntry[] };
        if (!payload.success || !payload.data) {
          setStatus("error");
          return;
        }
        setEntries(payload.data);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const targetTypes = useMemo(() => [...new Set(entries.map((entry) => entry.target_type))].sort(), [entries]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (targetType && entry.target_type !== targetType) return false;
      if (!needle) return true;
      return (
        entry.action.toLowerCase().includes(needle) ||
        entry.actor_id.toLowerCase().includes(needle) ||
        (entry.target_id ?? "").toLowerCase().includes(needle)
      );
    });
  }, [entries, search, targetType]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setSearch(searchInput);
  }

  const hasFilters = Boolean(search || targetType);

  const columns: Column<AuditLogEntry>[] = [
    { key: "action", header: "Action", render: (entry) => <span className="font-medium text-ink">{entry.action}</span> },
    {
      key: "target",
      header: "Target",
      render: (entry) => (
        <span className="text-ink-muted">
          {entry.target_type}
          {entry.target_id ? <span className="text-ink-subtle"> · {entry.target_id}</span> : null}
        </span>
      )
    },
    { key: "actor", header: "Actor", hideBelow: "sm", render: (entry) => <span className="font-mono text-xs text-ink-muted">{entry.actor_id}</span> },
    {
      key: "when",
      header: "When",
      hideBelow: "sm",
      render: (entry) => <span className="text-xs text-ink-subtle">{new Date(entry.created_at).toLocaleString()}</span>
    }
  ];

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader
          title="Activity"
          description={status === "ready" ? `${filtered.length} of ${entries.length} event${entries.length === 1 ? "" : "s"} (most recent 100)` : "Loading..."}
        />

        <TableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onSearchSubmit={submitSearch}
          searchPlaceholder="Search by action, actor or target ID"
          searchLabel="Search activity by action, actor or target ID"
          filters={
            <select
              value={targetType}
              onChange={(event) => setTargetType(event.target.value)}
              aria-label="Filter by target type"
              className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
            >
              <option value="">All entity types</option>
              {targetTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          }
        />

        <DataTable<AuditLogEntry>
          columns={columns}
          rows={filtered}
          status={status}
          getRowId={(entry) => entry.id}
          errorState={<ErrorState title="Could not load activity" />}
          emptyState={
            <EmptyState
              title={hasFilters ? "No events match these filters" : "No activity recorded yet"}
              description={hasFilters ? "Try adjusting or clearing your filters." : "Sensitive actions across the panel - product, order, customer and settings changes - will show up here."}
            />
          }
        />
      </main>
    </RequireAdminAuth>
  );
}
