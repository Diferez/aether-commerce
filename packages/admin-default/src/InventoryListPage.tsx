"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { History } from "lucide-react";
import { RequireAdminAuth } from "./RequireAdminAuth";
import { useAdminConfig } from "./AetherAdminProvider";
import { PageHeader } from "./PageHeader";
import { TableToolbar } from "./TableToolbar";
import { FilterBar, type FilterChip } from "./FilterBar";
import { StatusBadge, type StatusTone } from "./StatusBadge";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { useAdminLanguage } from "./AdminLanguageProvider";
import { countSubtitle, listResultHandlers, loadList, nextFilterState } from "./admin-list-helpers";
import type { AdminDictionary } from "@aether/i18n";

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

type Draft = { delta: string; reason: string };

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

function stockColorClass(stock: number, lowStockThreshold: number): string {
  if (stock <= 0) return "font-semibold text-danger";
  if (stock <= lowStockThreshold) return "font-semibold text-warning";
  return "text-ink-muted";
}

function stockStatus(product: AdminProductSummary, t: AdminDictionary): { label: string; tone: StatusTone } {
  if (product.stock <= 0) return { label: t.inventoryPage.stockOut, tone: "error" };
  if (product.stock <= product.lowStockThreshold) return { label: t.inventoryPage.stockLow, tone: "warning" };
  return { label: t.inventoryPage.stockInStock, tone: "success" };
}

type LoadStatus = "loading" | "ready" | "error";

function historyRowBody(status: LoadStatus, history: InventoryMovement[], locale: string, t: AdminDictionary): ReactNode {
  if (status === "loading") return <p className="text-sm text-ink-muted">{t.inventoryPage.loadingHistory}</p>;
  if (status === "error") return <p className="text-sm text-danger">{t.inventoryPage.couldNotLoadMovementHistory}</p>;
  if (history.length === 0) return <p className="text-sm text-ink-muted">{t.inventoryPage.noMovementsRecorded}</p>;
  return (
    <div className="grid gap-1.5">
      {history.map((movement) => (
        <div key={movement.id} className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <span className="font-semibold text-ink">{movement.type}</span>
          <span className="tabular-nums">{movement.quantity}</span>
          {movement.reason ? <span className="text-ink-subtle">&middot; {movement.reason}</span> : null}
          <span className="text-xs text-ink-subtle">
            {new Date(movement.created_at).toLocaleString(locale === "es" ? "es-ES" : "en-US")} &middot; {movement.actor_id ?? t.inventoryPage.systemActor}
          </span>
        </div>
      ))}
    </div>
  );
}

export function InventoryListPage() {
  const { getToken } = useAuth();
  const { apiBaseUrl } = useAdminConfig();
  const { t, locale } = useAdminLanguage();
  const stockLabel: Record<"low" | "out", string> = { low: t.inventoryPage.stockLow, out: t.inventoryPage.stockOut };

  const [filters, setFilters] = useState(() => readFiltersFromUrl());
  const [searchInput, setSearchInput] = useState(filters.search);
  const [result, setResult] = useState<ListResponse | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [adjustDrafts, setAdjustDrafts] = useState<Record<string, Draft>>({});
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const [history, setHistory] = useState<InventoryMovement[]>([]);
  const [historyStatus, setHistoryStatus] = useState<LoadStatus>("loading");

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

    await loadList<ListResponse>(
      `${apiBaseUrl}/api/v1/admin/products?${params.toString()}`,
      await authHeader(),
      ...listResultHandlers(setResult, setStatus)
    );
  }, [filters, authHeader, apiBaseUrl]);

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

  function draftFor(productId: string): Draft {
    return adjustDrafts[productId] ?? { delta: "", reason: "" };
  }

  function updateDraft(productId: string, patch: Partial<Draft>) {
    setAdjustDrafts((current) => ({ ...current, [productId]: { ...draftFor(productId), ...patch } }));
  }

  async function submitAdjustment(productId: string) {
    const draft = draftFor(productId);
    const delta = Number(draft.delta);
    if (!Number.isInteger(delta) || delta === 0) {
      setAdjustError(t.inventoryPage.adjustmentNonZeroRequired);
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
        setAdjustError(payload.error?.message ?? t.inventoryPage.couldNotAdjustStock);
        return;
      }
      setAdjustDrafts((current) => ({ ...current, [productId]: { delta: "", reason: "" } }));
      await load();
    } catch {
      setAdjustError(t.inventoryPage.couldNotAdjustStock);
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
    await loadList<InventoryMovement[]>(
      `${apiBaseUrl}/api/v1/admin/inventory/movements?productId=${encodeURIComponent(productId)}`,
      await authHeader(),
      ...listResultHandlers(setHistory, setHistoryStatus)
    );
  }

  const hasFilters = Boolean(filters.search || filters.stock);
  const chips: FilterChip[] = [];
  if (filters.stock) {
    chips.push({ key: "stock", label: t.inventoryPage.stockChip.replace("{value}", stockLabel[filters.stock as "low" | "out"]), onRemove: () => updateFilter("stock", "") });
  }

  let tableBody: ReactNode;
  if (status === "loading") {
    tableBody = (
      <div className="grid gap-2 p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="skeleton h-14 rounded-md" />
        ))}
      </div>
    );
  } else if (status === "error") {
    tableBody = (
      <div className="p-4">
        <ErrorState title={t.inventoryPage.couldNotLoadInventory} />
      </div>
    );
  } else if (!result || result.data.length === 0) {
    tableBody = (
      <EmptyState
        title={hasFilters ? t.inventoryPage.noProductsMatchFilters : t.inventoryPage.noProductsYet}
        description={hasFilters ? t.inventoryPage.tryAdjustingFilters : t.inventoryPage.noProductsYetDescription}
      />
    );
  } else {
    tableBody = (
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase tracking-wide text-ink-subtle">
          <tr>
            <th className="px-3 py-3">{t.inventoryPage.colProduct}</th>
            <th className="hidden px-3 py-3 sm:table-cell">{t.inventoryPage.colSku}</th>
            <th className="px-3 py-3 text-right">{t.inventoryPage.colStock}</th>
            <th className="px-3 py-3">{t.inventoryPage.colStatus}</th>
            <th className="px-3 py-3">{t.inventoryPage.colAdjust}</th>
            <th className="px-3 py-3">{t.inventoryPage.colHistory}</th>
          </tr>
        </thead>
        <tbody>
          {result.data.map((product) => {
            const rowStatus = stockStatus(product, t);
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
                    <span className={stockColorClass(product.stock, product.lowStockThreshold)}>{product.stock}</span>
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
                        placeholder={t.inventoryPage.deltaPlaceholder}
                        aria-label={t.inventoryPage.adjustmentAmountLabel.replace("{name}", product.name)}
                        className="focus-ring min-h-9 w-16 rounded-md border border-border bg-surface px-2 text-sm text-ink"
                      />
                      <input
                        value={draft.reason}
                        onChange={(event) => updateDraft(product.id, { reason: event.target.value })}
                        placeholder={t.inventoryPage.reasonPlaceholder}
                        aria-label={t.inventoryPage.reasonLabel.replace("{name}", product.name)}
                        className="focus-ring min-h-9 w-28 rounded-md border border-border bg-surface px-2 text-sm text-ink"
                      />
                      <button
                        type="button"
                        disabled={adjustingId === product.id}
                        onClick={() => void submitAdjustment(product.id)}
                        className="focus-ring min-h-9 rounded-md border border-border-strong px-2.5 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t.inventoryPage.apply}
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
                      {historyProductId === product.id ? t.inventoryPage.hide : t.inventoryPage.view}
                    </button>
                  </td>
                </tr>
                {historyProductId === product.id ? (
                  <tr className="border-b border-border bg-surface-hover last:border-b-0">
                    <td colSpan={6} className="px-3 py-3">
                      {historyRowBody(historyStatus, history, locale, t)}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader
          title={t.inventoryPage.title}
          description={countSubtitle(result?.pagination.total ?? null, t.inventoryPage.countOne, t.inventoryPage.countOther, t.inventoryPage.loading)}
        />

        <TableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onSearchSubmit={submitSearch}
          searchPlaceholder={t.inventoryPage.searchPlaceholder}
          searchLabel={t.inventoryPage.searchLabel}
          filters={
            <select
              value={filters.stock}
              onChange={(event) => updateFilter("stock", event.target.value)}
              aria-label={t.inventoryPage.filterByStock}
              className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-ink"
            >
              <option value="">{t.inventoryPage.allInventory}</option>
              <option value="low">{t.inventoryPage.stockLow}</option>
              <option value="out">{t.inventoryPage.stockOut}</option>
            </select>
          }
        />
        <FilterBar chips={chips} onClearAll={() => updateFilter("stock", "")} />

        {adjustError ? (
          <div className="mb-3">
            <ErrorState title={t.inventoryPage.couldNotAdjustStock} description={adjustError} />
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-border bg-surface">{tableBody}</div>

        {result && result.pagination.pageCount > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() => updateFilter("page", filters.page - 1)}
              className="focus-ring inline-flex items-center gap-1 rounded-md border border-border-strong px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.common.previous}
            </button>
            <span className="tabular-nums">
              {t.common.pageOf.replace("{page}", String(result.pagination.page)).replace("{pageCount}", String(result.pagination.pageCount))}
            </span>
            <button
              type="button"
              disabled={filters.page >= result.pagination.pageCount}
              onClick={() => updateFilter("page", filters.page + 1)}
              className="focus-ring rounded-md border border-border-strong px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.common.next}
            </button>
          </div>
        ) : null}
      </main>
    </RequireAdminAuth>
  );
}
