"use client";

import type { ReactNode } from "react";
import { ErrorState } from "./ErrorState";
import { useAdminLanguage } from "./AdminLanguageProvider";

export type Column<T> = {
  key: string;
  header: string;
  align?: "start" | "end";
  /** Column is hidden below this breakpoint rather than shrunk illegibly. */
  hideBelow?: "sm" | "md";
  render: (row: T) => ReactNode;
};

export type TableSelection<T> = {
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  /** Falls back to the row id when omitted - a human label reads much better for screen readers. */
  getRowLabel?: (row: T) => string;
};

function hideBelowClass(hideBelow?: "sm" | "md") {
  if (hideBelow === "sm") return "hidden sm:table-cell";
  if (hideBelow === "md") return "hidden md:table-cell";
  return "";
}

/**
 * Shared table shell for every list page (products, orders, customers,
 * inventory, activity). Renders only presentation - loading/error/empty
 * chrome, column alignment, optional row selection, pagination controls.
 * Callers own all fetching, filter state, and URL sync exactly as before.
 */
export function DataTable<T>({
  columns,
  rows,
  status,
  getRowId,
  pagination,
  onPageChange,
  emptyState,
  errorState,
  selection
}: {
  columns: Column<T>[];
  rows: T[];
  status: "loading" | "ready" | "error";
  getRowId: (row: T) => string;
  pagination?: { page: number; pageCount: number } | null;
  onPageChange?: (page: number) => void;
  emptyState: ReactNode;
  errorState?: ReactNode;
  selection?: TableSelection<T>;
}) {
  const { t } = useAdminLanguage();
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        {status === "loading" ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="skeleton h-14 rounded-md" />
            ))}
          </div>
        ) : status === "error" ? (
          <div className="p-4">{errorState ?? <ErrorState />}</div>
        ) : rows.length === 0 ? (
          emptyState
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-ink-subtle">
              <tr>
                {selection ? (
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={t.dataTable.selectAllRows}
                      checked={rows.length > 0 && rows.every((row) => selection.selectedIds.has(getRowId(row)))}
                      onChange={selection.onToggleAll}
                      className="h-4 w-4 rounded border-border-strong"
                    />
                  </th>
                ) : null}
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-3 py-3 ${column.align === "end" ? "text-right" : "text-left"} ${hideBelowClass(column.hideBelow)}`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = getRowId(row);
                return (
                  <tr key={id} className="border-b border-border last:border-b-0 hover:bg-surface-hover">
                    {selection ? (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={t.dataTable.selectRow.replace("{label}", selection.getRowLabel?.(row) ?? id)}
                          checked={selection.selectedIds.has(id)}
                          onChange={() => selection.onToggle(id)}
                          className="h-4 w-4 rounded border-border-strong"
                        />
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-3 py-3 ${column.align === "end" ? "text-right tabular-nums" : ""} ${hideBelowClass(column.hideBelow)}`}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pagination && pagination.pageCount > 1 && onPageChange ? (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => onPageChange(pagination.page - 1)}
            className="focus-ring inline-flex items-center gap-1 rounded-md border border-border-strong px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.common.previous}
          </button>
          <span className="tabular-nums">
            {t.common.pageOf.replace("{page}", String(pagination.page)).replace("{pageCount}", String(pagination.pageCount))}
          </span>
          <button
            type="button"
            disabled={pagination.page >= pagination.pageCount}
            onClick={() => onPageChange(pagination.page + 1)}
            className="focus-ring rounded-md border border-border-strong px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.common.next}
          </button>
        </div>
      ) : null}
    </div>
  );
}
