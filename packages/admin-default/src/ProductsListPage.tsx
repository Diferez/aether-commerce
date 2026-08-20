"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { EyeOff, Plus, Send } from "lucide-react";
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
import { countSubtitle, listResultHandlers, loadList, nextFilterState } from "./admin-list-helpers";

type AdminProductSummary = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  finalPriceCents: number;
  stock: number;
  lowStockThreshold: number;
  visibility: "draft" | "visible" | "hidden";
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListResponse = {
  data: AdminProductSummary[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};

// Filters live in the URL via history.replaceState (not next/navigation's
// useSearchParams()) for the same static-export reason documented in
// app/products/edit/page.tsx - reading window.location directly avoids the
// Suspense-boundary requirement that hook needs under `output: "export"`.
function readFiltersFromUrl() {
  if (typeof window === "undefined") return { search: "", visibility: "", category: "", stock: "", page: 1 };
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get("search") ?? "",
    visibility: params.get("visibility") ?? "",
    category: params.get("category") ?? "",
    stock: params.get("stock") ?? "",
    page: Number(params.get("page")) || 1
  };
}

function money(cents: number, locale: string) {
  return new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function stockColorClass(stock: number, lowStockThreshold: number): string {
  if (stock <= 0) return "font-semibold text-danger";
  if (stock <= lowStockThreshold) return "font-semibold text-warning";
  return "text-ink-muted";
}

const visibilityTone: Record<AdminProductSummary["visibility"], StatusTone> = {
  visible: "success",
  draft: "pending",
  hidden: "archived"
};

export function ProductsListPage() {
  const { getToken } = useAuth();
  const { apiBaseUrl } = useAdminConfig();
  const { t, locale } = useAdminLanguage();
  const visibilityLabel: Record<AdminProductSummary["visibility"], string> = {
    visible: t.productsPage.statusPublished,
    draft: t.productsPage.statusDraft,
    hidden: t.productsPage.statusArchived
  };
  const [filters, setFilters] = useState(() => readFiltersFromUrl());
  const [searchInput, setSearchInput] = useState(filters.search);
  const [result, setResult] = useState<ListResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.visibility) params.set("visibility", filters.visibility);
    if (filters.category) params.set("category", filters.category);
    if (filters.stock) params.set("stock", filters.stock);
    params.set("page", String(filters.page));
    params.set("pageSize", "25");

    window.history.replaceState(null, "", `?${params.toString()}`);

    const token = await getToken().catch(() => null);
    await loadList<ListResponse>(
      `${apiBaseUrl}/api/v1/admin/products?${params.toString()}`,
      token ? { authorization: `Bearer ${token}` } : {},
      ...listResultHandlers(setResult, setStatus)
    );
  }, [filters, getToken, apiBaseUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setSelected(new Set());
    setFilters((current) => nextFilterState(current, key, value));
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    updateFilter("search", searchInput);
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!result) return;
    setSelected((current) => (current.size === result.data.length ? new Set() : new Set(result.data.map((product) => product.id))));
  }

  async function bulkAction(action: "publish" | "archive") {
    if (selected.size === 0) return;
    setBulkPending(true);
    const token = await getToken().catch(() => null);
    try {
      await fetch(`${apiBaseUrl}/api/v1/admin/products/bulk`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ ids: [...selected], action })
      });
      setSelected(new Set());
      await load();
    } finally {
      setBulkPending(false);
    }
  }

  const hasFilters = Boolean(filters.search || filters.visibility || filters.category || filters.stock);
  const chips: FilterChip[] = [];
  if (filters.visibility) {
    chips.push({
      key: "visibility",
      label: t.productsPage.statusChip.replace("{value}", visibilityLabel[filters.visibility as AdminProductSummary["visibility"]]),
      onRemove: () => updateFilter("visibility", "")
    });
  }
  if (filters.stock) {
    chips.push({
      key: "stock",
      label: t.productsPage.stockChip.replace("{value}", filters.stock === "low" ? t.productsPage.stockLow : t.productsPage.stockOut),
      onRemove: () => updateFilter("stock", "")
    });
  }
  if (filters.category) {
    chips.push({ key: "category", label: t.productsPage.categoryChip.replace("{value}", filters.category), onRemove: () => updateFilter("category", "") });
  }

  const columns: Column<AdminProductSummary>[] = [
    {
      key: "product",
      header: t.productsPage.colProduct,
      render: (product) => (
        <a href={`/products/edit/?id=${encodeURIComponent(product.id)}`} className="focus-ring flex items-center gap-3">
          {product.thumbnail ? (
            // Plain <img>, not next/image - admin-managed, arbitrary remote/local URLs
            <img src={product.thumbnail} alt="" className="h-10 w-10 rounded-md border border-border object-cover" />
          ) : (
            <span className="h-10 w-10 rounded-md border border-border bg-surface-hover" aria-hidden />
          )}
          <span className="font-medium text-ink hover:underline">{product.name}</span>
        </a>
      )
    },
    { key: "sku", header: t.productsPage.colSku, hideBelow: "md", render: (product) => <span className="text-ink-muted">{product.sku}</span> },
    { key: "category", header: t.productsPage.colCategory, hideBelow: "md", render: (product) => <span className="text-ink-muted">{product.category}</span> },
    {
      key: "price",
      header: t.productsPage.colPrice,
      align: "end",
      render: (product) => (
        <>
          {money(product.finalPriceCents, locale)}
          {product.compareAtPriceCents ? <span className="ml-1.5 text-xs text-ink-subtle line-through">{money(product.compareAtPriceCents, locale)}</span> : null}
        </>
      )
    },
    {
      key: "stock",
      header: t.productsPage.colStock,
      align: "end",
      render: (product) => <span className={stockColorClass(product.stock, product.lowStockThreshold)}>{product.stock}</span>
    },
    {
      key: "status",
      header: t.productsPage.colStatus,
      render: (product) => <StatusBadge tone={visibilityTone[product.visibility]}>{visibilityLabel[product.visibility]}</StatusBadge>
    },
    {
      key: "updated",
      header: t.productsPage.colUpdated,
      hideBelow: "sm",
      render: (product) => <span className="text-xs text-ink-subtle">{new Date(product.updatedAt).toLocaleDateString(locale === "es" ? "es-ES" : "en-US")}</span>
    }
  ];

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader
          title={t.productsPage.title}
          description={countSubtitle(result?.pagination.total ?? null, t.productsPage.countOne, t.productsPage.countOther, t.productsPage.loading)}
          primaryAction={
            <a href="/products/new/" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
              <Plus size={16} aria-hidden />
              {t.productsPage.newProduct}
            </a>
          }
        />

        <TableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onSearchSubmit={submitSearch}
          searchPlaceholder={t.productsPage.searchPlaceholder}
          searchLabel={t.productsPage.searchLabel}
          filters={
            <>
              <select
                value={filters.visibility}
                onChange={(event) => updateFilter("visibility", event.target.value)}
                aria-label={t.productsPage.filterByStatus}
                className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">{t.productsPage.allStatuses}</option>
                <option value="draft">{t.productsPage.statusDraft}</option>
                <option value="visible">{t.productsPage.statusPublished}</option>
                <option value="hidden">{t.productsPage.statusArchived}</option>
              </select>
              <select
                value={filters.stock}
                onChange={(event) => updateFilter("stock", event.target.value)}
                aria-label={t.productsPage.filterByStock}
                className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">{t.productsPage.allInventory}</option>
                <option value="low">{t.productsPage.stockLow}</option>
                <option value="out">{t.productsPage.stockOut}</option>
              </select>
              <input
                value={filters.category}
                onChange={(event) => updateFilter("category", event.target.value)}
                placeholder={t.productsPage.categorySlugPlaceholder}
                aria-label={t.productsPage.filterByCategorySlug}
                className="focus-ring min-h-11 w-40 rounded-md border border-border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle"
              />
            </>
          }
        />
        <FilterBar chips={chips} onClearAll={() => setFilters((current) => ({ ...current, visibility: "", stock: "", category: "", page: 1 }))} />

        {selected.size > 0 ? (
          <div className="mb-3 flex items-center gap-3 rounded-md border border-border bg-surface-hover px-3 py-2 text-sm">
            <span className="font-medium text-ink">{t.productsPage.selectedCount.replace("{count}", String(selected.size))}</span>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => void bulkAction("publish")}
              className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 font-semibold text-ink disabled:opacity-50"
            >
              <Send size={13} aria-hidden />
              {t.productsPage.publish}
            </button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => void bulkAction("archive")}
              className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 font-semibold text-ink disabled:opacity-50"
            >
              <EyeOff size={13} aria-hidden />
              {t.productsPage.archive}
            </button>
          </div>
        ) : null}

        <DataTable<AdminProductSummary>
          columns={columns}
          rows={result?.data ?? []}
          status={status}
          getRowId={(product) => product.id}
          pagination={result?.pagination ?? null}
          onPageChange={(page) => updateFilter("page", page)}
          selection={{ selectedIds: selected, onToggle: toggleSelected, onToggleAll: toggleSelectAll, getRowLabel: (product) => product.name }}
          errorState={<ErrorState title={t.productsPage.couldNotLoad} />}
          emptyState={
            <EmptyState
              title={hasFilters ? t.productsPage.noProductsMatchFilters : t.dashboard.noProductsYetTitle}
              description={hasFilters ? t.productsPage.tryAdjustingFilters : t.dashboard.noProductsYetDescription}
              action={
                !hasFilters ? (
                  <a href="/products/new/" className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
                    <Plus size={15} aria-hidden />
                    {t.productsPage.createProduct}
                  </a>
                ) : undefined
              }
            />
          }
        />
      </main>
    </RequireAdminAuth>
  );
}
