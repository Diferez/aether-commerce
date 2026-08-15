"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Download, MessageCircle, Plus } from "lucide-react";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";
import { PageHeader } from "../../components/PageHeader";
import { TableToolbar } from "../../components/TableToolbar";
import { FilterBar, type FilterChip } from "../../components/FilterBar";
import { DataTable, type Column } from "../../components/DataTable";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { StatusBadge, type StatusTone } from "../../components/StatusBadge";

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

const paymentTone: Record<AdminOrderSummary["payment_status"], StatusTone> = {
  pending: "pending",
  paid: "success",
  failed: "error",
  refunded: "neutral",
  partially_refunded: "warning"
};

const fulfillmentTone: Record<AdminOrderSummary["fulfillment_status"], StatusTone> = {
  unfulfilled: "neutral",
  processing: "in-process",
  shipped: "info",
  delivered: "success",
  cancelled: "error"
};

const paymentLabel: Record<string, string> = { partially_refunded: "Partially refunded" };
const fulfillmentLabel: Record<string, string> = {};

function label(map: Record<string, string>, value: string) {
  return map[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

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

  const hasFilters = Boolean(filters.search || filters.channel || filters.paymentStatus || filters.fulfillmentStatus);
  const chips: FilterChip[] = [];
  if (filters.channel) chips.push({ key: "channel", label: `Channel: ${filters.channel === "whatsapp" ? "WhatsApp" : "Stripe"}`, onRemove: () => updateFilter("channel", "") });
  if (filters.paymentStatus) chips.push({ key: "payment", label: `Payment: ${label(paymentLabel, filters.paymentStatus)}`, onRemove: () => updateFilter("paymentStatus", "") });
  if (filters.fulfillmentStatus) chips.push({ key: "fulfillment", label: `Fulfillment: ${label(fulfillmentLabel, filters.fulfillmentStatus)}`, onRemove: () => updateFilter("fulfillmentStatus", "") });

  const columns: Column<AdminOrderSummary>[] = [
    {
      key: "order",
      header: "Order",
      render: (order) => (
        <a href={`/orders/detail/?id=${encodeURIComponent(order.id)}`} className="focus-ring font-medium text-ink hover:underline">
          {order.number}
        </a>
      )
    },
    { key: "customer", header: "Customer", hideBelow: "md", render: (order) => <span className="text-ink-muted">{order.email}</span> },
    {
      key: "channel",
      header: "Channel",
      hideBelow: "sm",
      render: (order) => (
        <span className="inline-flex items-center gap-1.5 text-ink-muted">
          {order.channel === "whatsapp" ? <MessageCircle size={13} aria-hidden /> : null}
          {order.channel === "whatsapp" ? "WhatsApp" : "Stripe"}
        </span>
      )
    },
    { key: "payment", header: "Payment", render: (order) => <StatusBadge tone={paymentTone[order.payment_status]}>{label(paymentLabel, order.payment_status)}</StatusBadge> },
    { key: "fulfillment", header: "Fulfillment", render: (order) => <StatusBadge tone={fulfillmentTone[order.fulfillment_status]}>{label(fulfillmentLabel, order.fulfillment_status)}</StatusBadge> },
    { key: "total", header: "Total", align: "end", render: (order) => money(order.total, order.currency) },
    {
      key: "created",
      header: "Created",
      hideBelow: "sm",
      render: (order) => <span className="text-xs text-ink-subtle">{new Date(order.created_at).toLocaleDateString()}</span>
    }
  ];

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader
          title="Orders"
          description={result ? `${result.pagination.total} order${result.pagination.total === 1 ? "" : "s"}` : "Loading..."}
          secondaryActions={
            <button
              type="button"
              onClick={() => void exportCsv()}
              className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong px-4 text-sm font-semibold text-ink hover:bg-surface-hover"
            >
              <Download size={16} aria-hidden />
              Export CSV
            </button>
          }
          primaryAction={
            <a href="/orders/new/" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
              <Plus size={16} aria-hidden />
              New WhatsApp order
            </a>
          }
        />

        <TableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onSearchSubmit={submitSearch}
          searchPlaceholder="Search by order number or email"
          searchLabel="Search orders by order number or email"
          filters={
            <>
              <select
                value={filters.channel}
                onChange={(event) => updateFilter("channel", event.target.value)}
                aria-label="Filter by channel"
                className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">All channels</option>
                <option value="stripe">Stripe</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <select
                value={filters.paymentStatus}
                onChange={(event) => updateFilter("paymentStatus", event.target.value)}
                aria-label="Filter by payment status"
                className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
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
                aria-label="Filter by fulfillment status"
                className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">All fulfillment statuses</option>
                <option value="unfulfilled">Unfulfilled</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </>
          }
        />
        <FilterBar
          chips={chips}
          onClearAll={() => setFilters((current) => ({ ...current, channel: "", paymentStatus: "", fulfillmentStatus: "", page: 1 }))}
        />

        <DataTable<AdminOrderSummary>
          columns={columns}
          rows={result?.data ?? []}
          status={status}
          getRowId={(order) => order.id}
          pagination={result?.pagination ?? null}
          onPageChange={(page) => updateFilter("page", page)}
          errorState={<ErrorState title="Could not load orders" />}
          emptyState={
            <EmptyState
              title={hasFilters ? "No orders match these filters" : "No orders yet"}
              description={hasFilters ? "Try adjusting or clearing your filters." : "Orders placed on the storefront or created manually will show up here."}
            />
          }
        />
      </main>
    </RequireAdminAuth>
  );
}
