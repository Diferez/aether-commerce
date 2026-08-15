"use client";

import { Search } from "lucide-react";

export function TableToolbar({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder,
  searchLabel,
  filters,
  actions
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (event: React.FormEvent) => void;
  searchPlaceholder: string;
  searchLabel: string;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <form onSubmit={onSearchSubmit} className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3">
        <Search size={15} className="text-ink-subtle" aria-hidden />
        <input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          className="min-h-11 w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
        />
      </form>
      {filters}
      {actions}
    </div>
  );
}
