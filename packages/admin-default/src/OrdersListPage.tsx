"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Download, MessageCircle, Plus } from "lucide-react";
import { RequireAdminAuth } from "./RequireAdminAuth";
import { useAdminConfig } from "./AetherAdminProvider";
import { PageHeader } from "./PageHeader";
import { TableToolbar } from "./TableToolbar";
import { FilterBar, type FilterChip } from "./FilterBar";
import { DataTable, type Column } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { StatusBadge, type StatusTone } from "./StatusBadge";
import { useAdminLanguage } from "./AdminLanguageProvider";
import { countSubtitle, exportOrdersCsv, loadList, nextFilterState } from "./admin-list-helpers";
import type { AdminDictionary } from "@aether/i18n";

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

function money(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-US", { style: "currency", currency }).format(cents / 100);
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

function statusLabel(t: AdminDictionary, value: keyof AdminDictionary["orderStatus"]) {
  const raw = t.orderStatus[value];
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function OrdersListPage() {
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
    if (filters.channel) params.set("channel", filters.channel);
    if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
    if (filters.fulfillmentStatus) params.set("fulfillmentStatus", filters.fulfillmentStatus);
    params.set("page", String(filters.page));
    params.set("pageSize", "25");

    window.history.replaceState(null, "", `?${params.toString()}`);

    const token = await getToken().catch(() => null);
    await loadList<ListResponse>(
      `${apiBaseUrl}/api/v1/admin/orders?${params.toString()}`,
      token ? { authorization: `Bearer ${token}` } : {},
      (data) => {
        setResult(data);
        setStatus("ready");
      },
      () => setStatus("error")
    );
  }, [filters, getToken, apiBaseUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters((current) => nextFilterState(current, key, value));
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    updateFilter("search", searchInput);
  }

  const hasFilters = Boolean(filters.search || filters.channel || filters.paymentStatus || filters.fulfillmentStatus);
  const chips: FilterChip[] = [];
  if (filters.channel)
    chips.push({
      key: "channel",
      label: t.ordersPage.channelChip.replace("{value}", filters.channel === "whatsapp" ? t.ordersPage.channelWhatsapp : t.ordersPage.channelStripe),
      onRemove: () => updateFilter("channel", "")
    });
  if (filters.paymentStatus)
    chips.push({
      key: "payment",
      label: t.ordersPage.paymentChip.replace("{value}", statusLabel(t, filters.paymentStatus as AdminOrderSummary["payment_status"])),
      onRemove: () => updateFilter("paymentStatus", "")
    });
  if (filters.fulfillmentStatus)
    chips.push({
      key: "fulfillment",
      label: t.ordersPage.fulfillmentChip.replace("{value}", statusLabel(t, filters.fulfillmentStatus as AdminOrderSummary["fulfillment_status"])),
      onRemove: () => updateFilter("fulfillmentStatus", "")
    });

  const columns: Column<AdminOrderSummary>[] = [
    {
      key: "order",
      header: t.ordersPage.colOrder,
      render: (order) => (
        <a href={`/orders/detail/?id=${encodeURIComponent(order.id)}`} className="focus-ring font-medium text-ink hover:underline">
          {order.number}
        </a>
      )
    },
    { key: "customer", header: t.ordersPage.colCustomer, hideBelow: "md", render: (order) => <span className="text-ink-muted">{order.email}</span> },
    {
      key: "channel",
      header: t.ordersPage.colChannel,
      hideBelow: "sm",
      render: (order) => (
        <span className="inline-flex items-center gap-1.5 text-ink-muted">
          {order.channel === "whatsapp" ? <MessageCircle size={13} aria-hidden /> : null}
          {order.channel === "whatsapp" ? t.ordersPage.channelWhatsapp : t.ordersPage.channelStripe}
        </span>
      )
    },
    { key: "payment", header: t.ordersPage.colPayment, render: (order) => <StatusBadge tone={paymentTone[order.payment_status]}>{statusLabel(t, order.payment_status)}</StatusBadge> },
    {
      key: "fulfillment",
      header: t.ordersPage.colFulfillment,
      render: (order) => <StatusBadge tone={fulfillmentTone[order.fulfillment_status]}>{statusLabel(t, order.fulfillment_status)}</StatusBadge>
    },
    { key: "total", header: t.ordersPage.colTotal, align: "end", render: (order) => money(order.total, order.currency, locale) },
    {
      key: "created",
      header: t.ordersPage.colCreated,
      hideBelow: "sm",
      render: (order) => <span className="text-xs text-ink-subtle">{new Date(order.created_at).toLocaleDateString(locale === "es" ? "es-ES" : "en-US")}</span>
    }
  ];

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader
          title={t.ordersPage.title}
          description={countSubtitle(result?.pagination.total ?? null, t.ordersPage.countOne, t.ordersPage.countOther, t.ordersPage.loading)}
          secondaryActions={
            <button
              type="button"
              onClick={() => void exportOrdersCsv(apiBaseUrl, getToken)}
              className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong px-4 text-sm font-semibold text-ink hover:bg-surface-hover"
            >
              <Download size={16} aria-hidden />
              {t.ordersPage.exportCsv}
            </button>
          }
          primaryAction={
            <a href="/orders/new/" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
              <Plus size={16} aria-hidden />
              {t.ordersPage.newWhatsappOrder}
            </a>
          }
        />

        <TableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onSearchSubmit={submitSearch}
          searchPlaceholder={t.ordersPage.searchPlaceholder}
          searchLabel={t.ordersPage.searchLabel}
          filters={
            <>
              <select
                value={filters.channel}
                onChange={(event) => updateFilter("channel", event.target.value)}
                aria-label={t.ordersPage.filterByChannel}
                className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">{t.ordersPage.allChannels}</option>
                <option value="stripe">{t.ordersPage.channelStripe}</option>
                <option value="whatsapp">{t.ordersPage.channelWhatsapp}</option>
              </select>
              <select
                value={filters.paymentStatus}
                onChange={(event) => updateFilter("paymentStatus", event.target.value)}
                aria-label={t.ordersPage.filterByPaymentStatus}
                className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">{t.ordersPage.allPaymentStatuses}</option>
                <option value="pending">{statusLabel(t, "pending")}</option>
                <option value="paid">{statusLabel(t, "paid")}</option>
                <option value="failed">{statusLabel(t, "failed")}</option>
                <option value="refunded">{statusLabel(t, "refunded")}</option>
                <option value="partially_refunded">{statusLabel(t, "partially_refunded")}</option>
              </select>
              <select
                value={filters.fulfillmentStatus}
                onChange={(event) => updateFilter("fulfillmentStatus", event.target.value)}
                aria-label={t.ordersPage.filterByFulfillmentStatus}
                className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">{t.ordersPage.allFulfillmentStatuses}</option>
                <option value="unfulfilled">{statusLabel(t, "unfulfilled")}</option>
                <option value="processing">{statusLabel(t, "processing")}</option>
                <option value="shipped">{statusLabel(t, "shipped")}</option>
                <option value="delivered">{statusLabel(t, "delivered")}</option>
                <option value="cancelled">{statusLabel(t, "cancelled")}</option>
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
          errorState={<ErrorState title={t.ordersPage.couldNotLoad} />}
          emptyState={
            <EmptyState
              title={hasFilters ? t.ordersPage.noOrdersMatchFilters : t.dashboard.noOrdersYetTitle}
              description={hasFilters ? t.ordersPage.tryAdjustingFilters : t.dashboard.noOrdersYetDescription}
            />
          }
        />
      </main>
    </RequireAdminAuth>
  );
}
