"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, ArrowLeft, EyeOff, Plus, Search, Send } from "lucide-react";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";

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

const statusStyles: Record<AdminProductSummary["visibility"], string> = {
  visible: "bg-teal-50 text-teal-700",
  draft: "bg-amber-50 text-amber-700",
  hidden: "bg-zinc-100 text-zinc-600"
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
    setSelected((current) =>
      current.size === result.data.length ? new Set() : new Set(result.data.map((product) => product.id))
    );
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

  return (
    <RequireAdminAuth>
      <main className="admin-shell py-8">
        <a href="/" className="focus-ring mb-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950">
          <ArrowLeft size={15} aria-hidden />
          Dashboard
        </a>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-950">Products</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {result ? `${result.pagination.total} product${result.pagination.total === 1 ? "" : "s"}` : "Loading..."}
            </p>
          </div>
          <a
            href="/products/new/"
            className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            <Plus size={16} aria-hidden />
            New product
          </a>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <form onSubmit={submitSearch} className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-zinc-300 px-3">
            <Search size={15} className="text-zinc-400" aria-hidden />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by name or SKU"
              className="min-h-11 w-full border-0 bg-transparent text-sm outline-none"
            />
          </form>
          <select
            value={filters.visibility}
            onChange={(event) => updateFilter("visibility", event.target.value)}
            className="focus-ring min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="visible">Published</option>
            <option value="hidden">Archived</option>
          </select>
          <select
            value={filters.stock}
            onChange={(event) => updateFilter("stock", event.target.value)}
            className="focus-ring min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
          >
            <option value="">All inventory</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
          <input
            value={filters.category}
            onChange={(event) => updateFilter("category", event.target.value)}
            placeholder="Category slug"
            className="focus-ring min-h-11 w-40 rounded-md border border-zinc-300 px-3 text-sm"
          />
        </div>

        {selected.size > 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm">
            <span className="font-medium text-zinc-700">{selected.size} selected</span>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => void bulkAction("publish")}
              className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-semibold text-zinc-700 disabled:opacity-50"
            >
              <Send size={13} aria-hidden />
              Publish
            </button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => void bulkAction("archive")}
              className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-semibold text-zinc-700 disabled:opacity-50"
            >
              <EyeOff size={13} aria-hidden />
              Archive
            </button>
          </div>
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
              Could not load products. Try again in a moment.
            </div>
          ) : !result || result.data.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">
              {filters.search || filters.visibility || filters.category || filters.stock
                ? "No products match these filters."
                : "No products yet - create the first one."}
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all products on this page"
                      checked={selected.size === result.data.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Price</th>
                  <th className="px-3 py-3">Stock</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((product) => (
                  <tr key={product.id} className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${product.name}`}
                        checked={selected.has(product.id)}
                        onChange={() => toggleSelected(product.id)}
                      />
                    </td>
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
                    <td className="px-3 py-3 text-zinc-600">{product.category}</td>
                    <td className="px-3 py-3 text-zinc-600">
                      {money(product.finalPriceCents)}
                      {product.compareAtPriceCents ? (
                        <span className="ml-1.5 text-xs text-zinc-400 line-through">{money(product.compareAtPriceCents)}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <span className={product.stock <= 0 ? "font-semibold text-rose-700" : product.stock <= product.lowStockThreshold ? "font-semibold text-amber-700" : "text-zinc-600"}>
                        {product.stock}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[product.visibility]}`}>
                        {product.visibility === "visible" ? "Published" : product.visibility === "draft" ? "Draft" : "Archived"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-500">{new Date(product.updatedAt).toLocaleDateString()}</td>
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
