"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { UserRound } from "lucide-react";
import { RequireAdminAuth } from "./RequireAdminAuth";
import { useAdminConfig } from "./AetherAdminProvider";
import { PageHeader } from "./PageHeader";
import { TableToolbar } from "./TableToolbar";
import { FilterBar, type FilterChip } from "./FilterBar";
import { DataTable, type Column } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { StatusBadge } from "./StatusBadge";
import { useAdminLanguage } from "./AdminLanguageProvider";

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

function money(cents: number, locale: string) {
  return new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

// Repeated shape behind this page's (and every other list page's) header
// subtitle: "{count} things" once the total is known, a loading fallback
// while it's still null.
function countSubtitle(total: number | null, singular: string, plural: string, fallback: string): string {
  if (total === null) return fallback;
  return (total === 1 ? singular : plural).replace("{count}", String(total));
}

export function CustomersListPage() {
  const { getToken } = useAuth();
  const { apiBaseUrl } = useAdminConfig();
  const { t, locale } = useAdminLanguage();
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
  }, [filters, getToken, apiBaseUrl]);

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
    chips.push({
      key: "status",
      label: t.customersPage.statusChip.replace("{value}", filters.status === "active" ? t.customersPage.statusActive : t.customersPage.statusSuspended),
      onRemove: () => updateFilter("status", "")
    });
  }

  const columns: Column<AdminCustomerSummary>[] = [
    {
      key: "customer",
      header: t.customersPage.colCustomer,
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
    {
      key: "origin",
      header: t.customersPage.colOrigin,
      hideBelow: "sm",
      render: (customer) => <span className="text-ink-muted">{customer.source === "guest" ? t.dashboard.guestCheckout : t.dashboard.registered}</span>
    },
    { key: "status", header: t.customersPage.colStatus, render: (customer) => <StatusBadge tone={customer.status === "suspended" ? "error" : "success"}>{t.customerStatus[customer.status]}</StatusBadge> },
    { key: "orders", header: t.customersPage.colOrders, align: "end", hideBelow: "md", render: (customer) => customer.orderCount },
    { key: "spent", header: t.customersPage.colSpent, align: "end", hideBelow: "md", render: (customer) => money(customer.totalSpent, locale) },
    {
      key: "lastOrder",
      header: t.customersPage.colLastOrder,
      hideBelow: "sm",
      render: (customer) => (
        <span className="text-xs text-ink-subtle">{customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString(locale === "es" ? "es-ES" : "en-US") : "—"}</span>
      )
    }
  ];

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader
          title={t.customersPage.title}
          description={countSubtitle(result?.pagination.total ?? null, t.customersPage.countOne, t.customersPage.countOther, t.customersPage.loading)}
        />

        <TableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onSearchSubmit={submitSearch}
          searchPlaceholder={t.customersPage.searchPlaceholder}
          searchLabel={t.customersPage.searchLabel}
          filters={
            <select
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
              aria-label={t.customersPage.filterByStatus}
              className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
            >
              <option value="">{t.customersPage.allStatuses}</option>
              <option value="active">{t.customersPage.statusActive}</option>
              <option value="suspended">{t.customersPage.statusSuspended}</option>
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
          errorState={<ErrorState title={t.customersPage.couldNotLoad} />}
          emptyState={
            <EmptyState
              title={hasFilters ? t.customersPage.noCustomersMatchFilters : t.customersPage.noCustomersYet}
              description={hasFilters ? t.customersPage.tryAdjustingFilters : t.customersPage.noCustomersYetDescription}
            />
          }
        />
      </main>
    </RequireAdminAuth>
  );
}
