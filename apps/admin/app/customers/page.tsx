"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { UserRound } from "lucide-react";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";
import { PageHeader } from "../../components/PageHeader";
import { TableToolbar } from "../../components/TableToolbar";
import { FilterBar, type FilterChip } from "../../components/FilterBar";
import { DataTable, type Column } from "../../components/DataTable";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { StatusBadge } from "../../components/StatusBadge";

type AdminCustomerSummary = {
  id: string;
  source: "registered" | "guest";
  name: string | null;
  email: string;
  roles: string[];
  status: "active" | "suspended";
  createdAt: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
};

type ListResponse = {
  data: AdminCustomerSummary[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};

// Same window.location.search pattern as app/orders/page.tsx - required
// because output: "export" (static, Cloudflare Pages) can't use
// next/navigation's useSearchParams() without a Suspense boundary.
function readFiltersFromUrl() {
  if (typeof window === "undefined") return { search: "", status: "", page: 1 };
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get("search") ?? "",
    status: params.get("status") ?? "",
    page: Number(params.get("page")) || 1
  };
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function CustomersListPage() {
  const { getToken } = useAuth();
  const [filters, setFilters] = useState(() => readFiltersFromUrl());
  const [searchInput, setSearchInput] = useState(filters.search);
  const [result, setResult] = useState<ListResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    params.set("page", String(filters.page));
    params.set("pageSize", "25");

    window.history.replaceState(null, "", `?${params.toString()}`);

    const token = await getToken().catch(() => null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/users?${params.toString()}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {}
      });
      const payload = (await response.json()) as { success: boolean; data?: ListResponse };
      if (!payload.success || !payload.data) {
        setStatus("error");
        return;
      }
      setResult(payload.data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [filters, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters((current) => ({ ...current, [key]: value, page: key === "page" ? (value as number) : 1 }));
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    updateFilter("search", searchInput);
  }

  const hasFilters = Boolean(filters.search || filters.status);
  const chips: FilterChip[] = [];
  if (filters.status) {
    chips.push({ key: "status", label: `Status: ${filters.status === "active" ? "Active" : "Suspended"}`, onRemove: () => updateFilter("status", "") });
  }

  const columns: Column<AdminCustomerSummary>[] = [
    {
      key: "customer",
      header: "Customer",
      render: (customer) => (
        <a href={`/customers/detail/?id=${encodeURIComponent(customer.id)}`} className="focus-ring flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-hover text-ink-subtle">
            <UserRound size={16} aria-hidden />
          </span>
          <span>
            <span className="block font-medium text-ink hover:underline">{customer.name ?? customer.email}</span>
            {customer.name ? <span className="block text-xs text-ink-subtle">{customer.email}</span> : null}
          </span>
        </a>
      )
    },
    { key: "origin", header: "Origin", hideBelow: "sm", render: (customer) => <span className="text-ink-muted">{customer.source === "guest" ? "Guest checkout" : "Registered"}</span> },
    { key: "status", header: "Status", render: (customer) => <StatusBadge tone={customer.status === "suspended" ? "error" : "success"}>{customer.status}</StatusBadge> },
    { key: "orders", header: "Orders", align: "end", hideBelow: "md", render: (customer) => customer.orderCount },
    { key: "spent", header: "Spent", align: "end", hideBelow: "md", render: (customer) => money(customer.totalSpent) },
    {
      key: "lastOrder",
      header: "Last order",
      hideBelow: "sm",
      render: (customer) => <span className="text-xs text-ink-subtle">{customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString() : "—"}</span>
    }
  ];

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader title="Customers" description={result ? `${result.pagination.total} customer${result.pagination.total === 1 ? "" : "s"}` : "Loading..."} />

        <TableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onSearchSubmit={submitSearch}
          searchPlaceholder="Search by name or email"
          searchLabel="Search customers by name or email"
          filters={
            <select
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
              aria-label="Filter by status"
              className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          }
        />
        <FilterBar chips={chips} onClearAll={() => updateFilter("status", "")} />

        <DataTable<AdminCustomerSummary>
          columns={columns}
          rows={result?.data ?? []}
          status={status}
          getRowId={(customer) => customer.id}
          pagination={result?.pagination ?? null}
          onPageChange={(page) => updateFilter("page", page)}
          errorState={<ErrorState title="Could not load customers" />}
          emptyState={
            <EmptyState
              title={hasFilters ? "No customers match these filters" : "No customers yet"}
              description={hasFilters ? "Try adjusting or clearing your filters." : "Registered accounts and guest checkouts will show up here."}
            />
          }
        />
      </main>
    </RequireAdminAuth>
  );
}
