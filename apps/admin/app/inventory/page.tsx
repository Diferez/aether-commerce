"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { History } from "lucide-react";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";
import { PageHeader } from "../../components/PageHeader";
import { TableToolbar } from "../../components/TableToolbar";
import { FilterBar, type FilterChip } from "../../components/FilterBar";
import { StatusBadge, type StatusTone } from "../../components/StatusBadge";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";

type AdminProductSummary = {
  id: string;
  sku: string;
  name: string;
  stock: number;
  lowStockThreshold: number;
  visibility: "draft" | "visible" | "hidden";
  thumbnail: string | null;
  updatedAt: string;
};

type ListResponse = {
  data: AdminProductSummary[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};

type InventoryMovement = {
  id: string;
  product_id: string;
  sku: string;
  type: string;
  quantity: number;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
};

// Same window.location.search pattern as app/products/page.tsx - required
// because output: "export" (static, Cloudflare Pages) can't use
// next/navigation's useSearchParams() without a Suspense boundary.
function readFiltersFromUrl() {
  if (typeof window === "undefined") return { search: "", stock: "", page: 1 };
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get("search") ?? "",
    stock: params.get("stock") ?? "",
    page: Number(params.get("page")) || 1
  };
}

const stockLabel: Record<"low" | "out", string> = { low: "Low stock", out: "Out of stock" };

function stockStatus(product: AdminProductSummary): { label: string; tone: StatusTone } {
  if (product.stock <= 0) return { label: "Out of stock", tone: "error" };
  if (product.stock <= product.lowStockThreshold) return { label: "Low stock", tone: "warning" };
  return { label: "In stock", tone: "success" };
}

export default function InventoryListPage() {
  const { getToken } = useAuth();
  const [filters, setFilters] = useState(() => readFiltersFromUrl());
  const [searchInput, setSearchInput] = useState(filters.search);
  const [result, setResult] = useState<ListResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [adjustDrafts, setAdjustDrafts] = useState<Record<string, { delta: string; reason: string }>>({});
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const [history, setHistory] = useState<InventoryMovement[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready" | "error">("loading");

  const authHeader = useCallback(async () => {
    const token = await getToken().catch(() => null);
    return token ? { authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const load = useCallback(async () => {
    setStatus("loading");
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.stock) params.set("stock", filters.stock);
    params.set("page", String(filters.page));
    params.set("pageSize", "25");

    window.history.replaceState(null, "", `?${params.toString()}`);

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/products?${params.toString()}`, {
        headers: await authHeader()
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
  }, [filters, authHeader]);

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

  function draftFor(productId: string) {
    return adjustDrafts[productId] ?? { delta: "", reason: "" };
  }

  function updateDraft(productId: string, patch: Partial<{ delta: string; reason: string }>) {
    setAdjustDrafts((current) => ({ ...current, [productId]: { ...draftFor(productId), ...patch } }));
  }

  async function submitAdjustment(productId: string) {
    const draft = draftFor(productId);
    const delta = Number(draft.delta);
    if (!Number.isInteger(delta) || delta === 0) {
      setAdjustError("Enter a non-zero whole number for the adjustment.");
      return;
    }
    setAdjustingId(productId);
    setAdjustError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/products/${encodeURIComponent(productId)}/inventory-adjustment`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ delta, reason: draft.reason || undefined })
      });
      const payload = (await response.json()) as { success: boolean; error?: { message?: string } };
      if (!payload.success) {
        setAdjustError(payload.error?.message ?? "Could not adjust stock.");
        return;
      }
      setAdjustDrafts((current) => ({ ...current, [productId]: { delta: "", reason: "" } }));
      await load();
    } catch {
      setAdjustError("Could not adjust stock.");
    } finally {
      setAdjustingId(null);
    }
  }

  async function openHistory(productId: string) {
    if (historyProductId === productId) {
      setHistoryProductId(null);
      return;
    }
    setHistoryProductId(productId);
    setHistoryStatus("loading");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/inventory/movements?productId=${encodeURIComponent(productId)}`, {
        headers: await authHeader()
      });
      const payload = (await response.json()) as { success: boolean; data?: InventoryMovement[] };
      if (!payload.success || !payload.data) {
        setHistoryStatus("error");
        return;
      }
      setHistory(payload.data);
      setHistoryStatus("ready");
    } catch {
      setHistoryStatus("error");
    }
  }

  const hasFilters = Boolean(filters.search || filters.stock);
  const chips: FilterChip[] = [];
  if (filters.stock) {
    chips.push({ key: "stock", label: `Stock: ${stockLabel[filters.stock as "low" | "out"]}`, onRemove: () => updateFilter("stock", "") });
  }

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader title="Inventory" description={result ? `${result.pagination.total} product${result.pagination.total === 1 ? "" : "s"}` : "Loading..."} />

        <TableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onSearchSubmit={submitSearch}
          searchPlaceholder="Search by name or SKU"
          searchLabel="Search inventory by product name or SKU"
          filters={
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
          }
        />
        <FilterBar chips={chips} onClearAll={() => updateFilter("stock", "")} />

        {adjustError ? (
          <div className="mb-3">
            <ErrorState title="Could not adjust stock" description={adjustError} />
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          {status === "loading" ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="skeleton h-14 rounded-md" />
              ))}
            </div>
          ) : status === "error" ? (
            <div className="p-4">
              <ErrorState title="Could not load inventory" />
            </div>
          ) : !result || result.data.length === 0 ? (
            <EmptyState
              title={hasFilters ? "No products match these filters" : "No products yet"}
              description={hasFilters ? "Try adjusting or clearing your filters." : "Products you create will show up here once they have stock to track."}
            />
          ) : (
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-ink-subtle">
                <tr>
                  <th className="px-3 py-3">Product</th>
                  <th className="hidden px-3 py-3 sm:table-cell">SKU</th>
                  <th className="px-3 py-3 text-right">Stock</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Adjust</th>
                  <th className="px-3 py-3">History</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((product) => {
                  const rowStatus = stockStatus(product);
                  const draft = draftFor(product.id);
                  return (
                    <Fragment key={product.id}>
                      <tr className="border-b border-border last:border-b-0 hover:bg-surface-hover">
                        <td className="px-3 py-3">
                          <a href={`/products/edit/?id=${encodeURIComponent(product.id)}`} className="focus-ring flex items-center gap-3">
                            {product.thumbnail ? (
                              // Plain <img>, not next/image - admin-managed, arbitrary remote/local URLs
                              <img src={product.thumbnail} alt="" className="h-10 w-10 rounded-md border border-border object-cover" />
                            ) : (
                              <span className="h-10 w-10 rounded-md border border-border bg-surface-hover" aria-hidden />
                            )}
                            <span className="font-medium text-ink hover:underline">{product.name}</span>
                          </a>
                        </td>
                        <td className="hidden px-3 py-3 text-ink-muted sm:table-cell">{product.sku}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          <span className={product.stock <= 0 ? "font-semibold text-danger" : product.stock <= product.lowStockThreshold ? "font-semibold text-warning" : "text-ink-muted"}>
                            {product.stock}
                          </span>
                          <span className="ml-1 text-xs text-ink-subtle">/ {product.lowStockThreshold}</span>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge tone={rowStatus.tone}>{rowStatus.label}</StatusBadge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              value={draft.delta}
                              onChange={(event) => updateDraft(product.id, { delta: event.target.value })}
                              placeholder="+/-"
                              aria-label={`Stock adjustment amount for ${product.name}`}
                              className="focus-ring min-h-9 w-16 rounded-md border border-border bg-surface px-2 text-sm text-ink"
                            />
                            <input
                              value={draft.reason}
                              onChange={(event) => updateDraft(product.id, { reason: event.target.value })}
                              placeholder="Reason"
                              aria-label={`Reason for stock adjustment for ${product.name}`}
                              className="focus-ring min-h-9 w-28 rounded-md border border-border bg-surface px-2 text-sm text-ink"
                            />
                            <button
                              type="button"
                              disabled={adjustingId === product.id}
                              onClick={() => void submitAdjustment(product.id)}
                              className="focus-ring min-h-9 rounded-md border border-border-strong px-2.5 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Apply
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => void openHistory(product.id)}
                            className="focus-ring inline-flex items-center gap-1.5 text-sm font-semibold text-ink hover:underline"
                          >
                            <History size={14} aria-hidden />
                            {historyProductId === product.id ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {historyProductId === product.id ? (
                        <tr className="border-b border-border bg-surface-hover last:border-b-0">
                          <td colSpan={6} className="px-3 py-3">
                            {historyStatus === "loading" ? (
                              <p className="text-sm text-ink-muted">Loading history...</p>
                            ) : historyStatus === "error" ? (
                              <p className="text-sm text-danger">Could not load movement history.</p>
                            ) : history.length === 0 ? (
                              <p className="text-sm text-ink-muted">No movements recorded yet.</p>
                            ) : (
                              <div className="grid gap-1.5">
                                {history.map((movement) => (
                                  <div key={movement.id} className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                                    <span className="font-semibold text-ink">{movement.type}</span>
                                    <span className="tabular-nums">{movement.quantity}</span>
                                    {movement.reason ? <span className="text-ink-subtle">&middot; {movement.reason}</span> : null}
                                    <span className="text-xs text-ink-subtle">
                                      {new Date(movement.created_at).toLocaleString()} &middot; {movement.actor_id ?? "system"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {result && result.pagination.pageCount > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() => updateFilter("page", filters.page - 1)}
              className="focus-ring inline-flex items-center gap-1 rounded-md border border-border-strong px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="tabular-nums">
              Page {result.pagination.page} of {result.pagination.pageCount}
            </span>
            <button
              type="button"
              disabled={filters.page >= result.pagination.pageCount}
              onClick={() => updateFilter("page", filters.page + 1)}
              className="focus-ring rounded-md border border-border-strong px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        ) : null}
      </main>
    </RequireAdminAuth>
  );
}
