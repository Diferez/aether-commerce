"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { EyeOff, Plus, Send } from "lucide-react";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";
import { PageHeader } from "../../components/PageHeader";
import { TableToolbar } from "../../components/TableToolbar";
import { FilterBar, type FilterChip } from "../../components/FilterBar";
import { DataTable, type Column } from "../../components/DataTable";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { StatusBadge, type StatusTone } from "../../components/StatusBadge";

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

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const visibilityTone: Record<AdminProductSummary["visibility"], StatusTone> = {
  visible: "success",
  draft: "pending",
  hidden: "archived"
};
const visibilityLabel: Record<AdminProductSummary["visibility"], string> = {
  visible: "Published",
  draft: "Draft",
  hidden: "Archived"
};

export default function ProductsListPage() {
  const { getToken } = useAuth();
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
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/products?${params.toString()}`, {
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
    setSelected(new Set());
    setFilters((current) => ({ ...current, [key]: value, page: key === "page" ? (value as number) : 1 }));
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
    chips.push({ key: "visibility", label: `Status: ${visibilityLabel[filters.visibility as AdminProductSummary["visibility"]]}`, onRemove: () => updateFilter("visibility", "") });
  }
  if (filters.stock) {
    chips.push({ key: "stock", label: `Stock: ${filters.stock === "low" ? "Low" : "Out"}`, onRemove: () => updateFilter("stock", "") });
  }
  if (filters.category) {
    chips.push({ key: "category", label: `Category: ${filters.category}`, onRemove: () => updateFilter("category", "") });
  }

  const columns: Column<AdminProductSummary>[] = [
    {
      key: "product",
      header: "Product",
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
    { key: "sku", header: "SKU", hideBelow: "md", render: (product) => <span className="text-ink-muted">{product.sku}</span> },
    { key: "category", header: "Category", hideBelow: "md", render: (product) => <span className="text-ink-muted">{product.category}</span> },
    {
      key: "price",
      header: "Price",
      align: "end",
      render: (product) => (
        <>
          {money(product.finalPriceCents)}
          {product.compareAtPriceCents ? <span className="ml-1.5 text-xs text-ink-subtle line-through">{money(product.compareAtPriceCents)}</span> : null}
        </>
      )
    },
    {
      key: "stock",
      header: "Stock",
      align: "end",
      render: (product) => (
        <span className={product.stock <= 0 ? "font-semibold text-danger" : product.stock <= product.lowStockThreshold ? "font-semibold text-warning" : "text-ink-muted"}>
          {product.stock}
        </span>
      )
    },
    {
      key: "status",
      header: "Status",
      render: (product) => <StatusBadge tone={visibilityTone[product.visibility]}>{visibilityLabel[product.visibility]}</StatusBadge>
    },
    {
      key: "updated",
      header: "Updated",
      hideBelow: "sm",
      render: (product) => <span className="text-xs text-ink-subtle">{new Date(product.updatedAt).toLocaleDateString()}</span>
    }
  ];

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader
          title="Products"
          description={result ? `${result.pagination.total} product${result.pagination.total === 1 ? "" : "s"}` : "Loading..."}
          primaryAction={
            <a href="/products/new/" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
              <Plus size={16} aria-hidden />
              New product
            </a>
          }
        />

        <TableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onSearchSubmit={submitSearch}
          searchPlaceholder="Search by name or SKU"
          searchLabel="Search products by name or SKU"
          filters={
            <>
              <select
                value={filters.visibility}
                onChange={(event) => updateFilter("visibility", event.target.value)}
                aria-label="Filter by status"
                className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="visible">Published</option>
                <option value="hidden">Archived</option>
              </select>
              <select
                value={filters.stock}
                onChange={(event) => updateFilter("stock", event.target.value)}
                aria-label="Filter by stock status"
                className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">All inventory</option>
                <option value="low">Low stock</option>
                <option value="out">Out of stock</option>
              </select>
              <input
                value={filters.category}
                onChange={(event) => updateFilter("category", event.target.value)}
                placeholder="Category slug"
                aria-label="Filter by category slug"
                className="focus-ring min-h-11 w-40 rounded-md border border-border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle"
              />
            </>
          }
        />
        <FilterBar chips={chips} onClearAll={() => setFilters((current) => ({ ...current, visibility: "", stock: "", category: "", page: 1 }))} />

        {selected.size > 0 ? (
          <div className="mb-3 flex items-center gap-3 rounded-md border border-border bg-surface-hover px-3 py-2 text-sm">
            <span className="font-medium text-ink">{selected.size} selected</span>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => void bulkAction("publish")}
              className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 font-semibold text-ink disabled:opacity-50"
            >
              <Send size={13} aria-hidden />
              Publish
            </button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => void bulkAction("archive")}
              className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 font-semibold text-ink disabled:opacity-50"
            >
              <EyeOff size={13} aria-hidden />
              Archive
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
          errorState={<ErrorState title="Could not load products" />}
          emptyState={
            <EmptyState
              title={hasFilters ? "No products match these filters" : "No products yet"}
              description={hasFilters ? "Try adjusting or clearing your filters." : "Create the first product to start building the catalog."}
              action={
                !hasFilters ? (
                  <a href="/products/new/" className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
                    <Plus size={15} aria-hidden />
                    Create product
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
