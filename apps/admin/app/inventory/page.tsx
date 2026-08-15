"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, ArrowLeft, History, Search } from "lucide-react";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";

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

function stockStatus(product: AdminProductSummary): { label: string; className: string } {
  if (product.stock <= 0) return { label: "Out of stock", className: "bg-rose-50 text-rose-700" };
  if (product.stock <= product.lowStockThreshold) return { label: "Low stock", className: "bg-amber-50 text-amber-700" };
  return { label: "In stock", className: "bg-teal-50 text-teal-700" };
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

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <a href="/" className="focus-ring mb-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950">
          <ArrowLeft size={15} aria-hidden />
          Dashboard
        </a>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-950">Inventory</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {result ? `${result.pagination.total} product${result.pagination.total === 1 ? "" : "s"}` : "Loading..."}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <form onSubmit={submitSearch} className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-zinc-300 px-3">
            <Search size={15} className="text-zinc-400" aria-hidden />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by name or SKU"
              aria-label="Search inventory by product name or SKU"
              className="min-h-11 w-full border-0 bg-transparent text-sm outline-none"
            />
          </form>
          <select
            value={filters.stock}
            onChange={(event) => updateFilter("stock", event.target.value)}
            aria-label="Filter by stock status"
            className="focus-ring min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
          >
            <option value="">All inventory</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
        </div>

        {adjustError ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{adjustError}</div>
        ) : null}

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
              Could not load inventory. Try again in a moment.
            </div>
          ) : !result || result.data.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">
              {filters.search || filters.stock ? "No products match these filters." : "No products yet."}
            </div>
          ) : (
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3">Stock</th>
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
                      <tr className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50">
                        <td className="px-3 py-3">
                          <a href={`/products/edit/?id=${encodeURIComponent(product.id)}`} className="focus-ring flex items-center gap-3">
                            {product.thumbnail ? (
                              // Plain <img>, not next/image - admin-managed, arbitrary remote/local URLs
                              <img src={product.thumbnail} alt="" className="h-10 w-10 rounded-md border border-zinc-200 object-cover" />
                            ) : (
                              <span className="h-10 w-10 rounded-md border border-zinc-200 bg-zinc-100" aria-hidden />
                            )}
                            <span className="font-medium text-zinc-950 hover:underline">{product.name}</span>
                          </a>
                        </td>
                        <td className="px-3 py-3 text-zinc-600">{product.sku}</td>
                        <td className="px-3 py-3">
                          <span className={product.stock <= 0 ? "font-semibold text-rose-700" : product.stock <= product.lowStockThreshold ? "font-semibold text-amber-700" : "text-zinc-600"}>
                            {product.stock}
                          </span>
                          <span className="ml-1 text-xs text-zinc-400">/ {product.lowStockThreshold}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${rowStatus.className}`}>{rowStatus.label}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              value={draft.delta}
                              onChange={(event) => updateDraft(product.id, { delta: event.target.value })}
                              placeholder="+/-"
                              aria-label={`Stock adjustment amount for ${product.name}`}
                              className="focus-ring min-h-9 w-16 rounded-md border border-zinc-300 px-2 text-sm"
                            />
                            <input
                              value={draft.reason}
                              onChange={(event) => updateDraft(product.id, { reason: event.target.value })}
                              placeholder="Reason"
                              aria-label={`Reason for stock adjustment for ${product.name}`}
                              className="focus-ring min-h-9 w-28 rounded-md border border-zinc-300 px-2 text-sm"
                            />
                            <button
                              type="button"
                              disabled={adjustingId === product.id}
                              onClick={() => void submitAdjustment(product.id)}
                              className="focus-ring min-h-9 rounded-md border border-zinc-300 px-2.5 text-sm font-semibold hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Apply
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => void openHistory(product.id)}
                            className="focus-ring inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-700 hover:underline"
                          >
                            <History size={14} aria-hidden />
                            {historyProductId === product.id ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {historyProductId === product.id ? (
                        <tr className="border-b border-zinc-100 bg-zinc-50 last:border-b-0">
                          <td colSpan={6} className="px-3 py-3">
                            {historyStatus === "loading" ? (
                              <p className="text-sm text-zinc-500">Loading history...</p>
                            ) : historyStatus === "error" ? (
                              <p className="text-sm text-rose-700">Could not load movement history.</p>
                            ) : history.length === 0 ? (
                              <p className="text-sm text-zinc-500">No movements recorded yet.</p>
                            ) : (
                              <div className="grid gap-1.5">
                                {history.map((movement) => (
                                  <div key={movement.id} className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
                                    <span className="font-semibold text-zinc-950">{movement.type}</span>
                                    <span>{movement.quantity}</span>
                                    {movement.reason ? <span className="text-zinc-500">&middot; {movement.reason}</span> : null}
                                    <span className="text-xs text-zinc-400">
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
