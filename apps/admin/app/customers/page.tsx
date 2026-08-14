"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, ArrowLeft, Search, UserRound } from "lucide-react";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";

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

const statusStyles: Record<AdminCustomerSummary["status"], string> = {
  active: "bg-teal-50 text-teal-700",
  suspended: "bg-rose-50 text-rose-700"
};

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

  return (
    <RequireAdminAuth>
      <main className="admin-shell py-8">
        <a href="/" className="focus-ring mb-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950">
          <ArrowLeft size={15} aria-hidden />
          Dashboard
        </a>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-950">Customers</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {result ? `${result.pagination.total} customer${result.pagination.total === 1 ? "" : "s"}` : "Loading..."}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <form onSubmit={submitSearch} className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-zinc-300 px-3">
            <Search size={15} className="text-zinc-400" aria-hidden />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by name or email"
              className="min-h-11 w-full border-0 bg-transparent text-sm outline-none"
            />
          </form>
          <select
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
            className="focus-ring min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          {status === "loading" ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-md bg-zinc-100" />
              ))}
            </div>
          ) : status === "error" ? (
            <div className="flex items-center gap-2 p-6 text-sm text-rose-700">
              <AlertTriangle size={16} aria-hidden />
              Could not load customers. Try again in a moment.
            </div>
          ) : !result || result.data.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">
              {filters.search || filters.status ? "No customers match these filters." : "No customers yet."}
            </div>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Origin</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Orders</th>
                  <th className="px-3 py-3">Spent</th>
                  <th className="px-3 py-3">Last order</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((customer) => (
                  <tr key={customer.id} className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50">
                    <td className="px-3 py-3">
                      <a
                        href={`/customers/detail/?id=${encodeURIComponent(customer.id)}`}
                        className="focus-ring flex items-center gap-3"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500">
                          <UserRound size={16} aria-hidden />
                        </span>
                        <span>
                          <span className="block font-medium text-zinc-950 hover:underline">
                            {customer.name ?? customer.email}
                          </span>
                          {customer.name ? <span className="block text-xs text-zinc-500">{customer.email}</span> : null}
                        </span>
                      </a>
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{customer.source === "guest" ? "Guest checkout" : "Registered"}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[customer.status]}`}>
                        {customer.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{customer.orderCount}</td>
                    <td className="px-3 py-3 text-zinc-600">{money(customer.totalSpent)}</td>
                    <td className="px-3 py-3 text-xs text-zinc-500">
                      {customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {result && result.pagination.pageCount > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm text-zinc-600">
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() => updateFilter("page", filters.page - 1)}
              className="focus-ring inline-flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span>
              Page {result.pagination.page} of {result.pagination.pageCount}
            </span>
            <button
              type="button"
              disabled={filters.page >= result.pagination.pageCount}
              onClick={() => updateFilter("page", filters.page + 1)}
              className="focus-ring rounded-md border border-zinc-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        ) : null}
      </main>
    </RequireAdminAuth>
  );
}
