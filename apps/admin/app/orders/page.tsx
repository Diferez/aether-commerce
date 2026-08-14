"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, ArrowLeft, Download, MessageCircle, Plus, Search } from "lucide-react";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";

type AdminOrderSummary = {
  id: string;
  number: string;
  email: string;
  state: string;
  channel: "stripe" | "whatsapp";
  payment_status: "pending" | "paid" | "failed" | "refunded" | "partially_refunded";
  fulfillment_status: "unfulfilled" | "processing" | "shipped" | "delivered" | "cancelled";
  total: number;
  currency: string;
  created_at: string;
};

type ListResponse = {
  data: AdminOrderSummary[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};

// Same window.location.search pattern as app/products/page.tsx - required
// because output: "export" (static, Cloudflare Pages) can't use
// next/navigation's useSearchParams() without a Suspense boundary.
function readFiltersFromUrl() {
  if (typeof window === "undefined") {
    return { search: "", channel: "", paymentStatus: "", fulfillmentStatus: "", page: 1 };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get("search") ?? "",
    channel: params.get("channel") ?? "",
    paymentStatus: params.get("paymentStatus") ?? "",
    fulfillmentStatus: params.get("fulfillmentStatus") ?? "",
    page: Number(params.get("page")) || 1
  };
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

const paymentStyles: Record<AdminOrderSummary["payment_status"], string> = {
  pending: "bg-amber-50 text-amber-700",
  paid: "bg-teal-50 text-teal-700",
  failed: "bg-rose-50 text-rose-700",
  refunded: "bg-zinc-100 text-zinc-600",
  partially_refunded: "bg-zinc-100 text-zinc-600"
};

const fulfillmentStyles: Record<AdminOrderSummary["fulfillment_status"], string> = {
  unfulfilled: "bg-zinc-100 text-zinc-600",
  processing: "bg-amber-50 text-amber-700",
  shipped: "bg-sky-50 text-sky-700",
  delivered: "bg-teal-50 text-teal-700",
  cancelled: "bg-rose-50 text-rose-700"
};

export default function OrdersListPage() {
  const { getToken } = useAuth();
  const [filters, setFilters] = useState(() => readFiltersFromUrl());
  const [searchInput, setSearchInput] = useState(filters.search);
  const [result, setResult] = useState<ListResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.channel) params.set("channel", filters.channel);
    if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
    if (filters.fulfillmentStatus) params.set("fulfillmentStatus", filters.fulfillmentStatus);
    params.set("page", String(filters.page));
    params.set("pageSize", "25");

    window.history.replaceState(null, "", `?${params.toString()}`);

    const token = await getToken().catch(() => null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/orders?${params.toString()}`, {
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

  async function exportCsv() {
    const token = await getToken().catch(() => null);
    const response = await fetch(`${apiBaseUrl}/api/v1/admin/export/orders`, {
      headers: token ? { authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "orders-export.csv";
    link.click();
    URL.revokeObjectURL(url);
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
            <h1 className="text-2xl font-semibold text-zinc-950">Orders</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {result ? `${result.pagination.total} order${result.pagination.total === 1 ? "" : "s"}` : "Loading..."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void exportCsv()}
              className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <Download size={16} aria-hidden />
              Export CSV
            </button>
            <a
              href="/orders/new/"
              className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              <Plus size={16} aria-hidden />
              New WhatsApp order
            </a>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <form onSubmit={submitSearch} className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-zinc-300 px-3">
            <Search size={15} className="text-zinc-400" aria-hidden />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by order number or email"
              className="min-h-11 w-full border-0 bg-transparent text-sm outline-none"
            />
          </form>
          <select
            value={filters.channel}
            onChange={(event) => updateFilter("channel", event.target.value)}
            className="focus-ring min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
          >
            <option value="">All channels</option>
            <option value="stripe">Stripe</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <select
            value={filters.paymentStatus}
            onChange={(event) => updateFilter("paymentStatus", event.target.value)}
            className="focus-ring min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
          >
            <option value="">All payment statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
            <option value="partially_refunded">Partially refunded</option>
          </select>
          <select
            value={filters.fulfillmentStatus}
            onChange={(event) => updateFilter("fulfillmentStatus", event.target.value)}
            className="focus-ring min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
          >
            <option value="">All fulfillment statuses</option>
            <option value="unfulfilled">Unfulfilled</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
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
              Could not load orders. Try again in a moment.
            </div>
          ) : !result || result.data.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">
              {filters.search || filters.channel || filters.paymentStatus || filters.fulfillmentStatus
                ? "No orders match these filters."
                : "No orders yet."}
            </div>
          ) : (
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-3">Order</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Channel</th>
                  <th className="px-3 py-3">Payment</th>
                  <th className="px-3 py-3">Fulfillment</th>
                  <th className="px-3 py-3">Total</th>
                  <th className="px-3 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((order) => (
                  <tr key={order.id} className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50">
                    <td className="px-3 py-3">
                      <a href={`/orders/detail/?id=${encodeURIComponent(order.id)}`} className="focus-ring font-medium text-zinc-950 hover:underline">
                        {order.number}
                      </a>
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{order.email}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-zinc-600">
                        {order.channel === "whatsapp" ? <MessageCircle size={13} aria-hidden /> : null}
                        {order.channel === "whatsapp" ? "WhatsApp" : "Stripe"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${paymentStyles[order.payment_status]}`}>
                        {order.payment_status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${fulfillmentStyles[order.fulfillment_status]}`}>
                        {order.fulfillment_status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{money(order.total, order.currency)}</td>
                    <td className="px-3 py-3 text-xs text-zinc-500">{new Date(order.created_at).toLocaleDateString()}</td>
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
