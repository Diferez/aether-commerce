"use client";

import { X } from "lucide-react";
import { useAdminLanguage } from "./AdminLanguageProvider";

export type FilterChip = { key: string; label: string; onRemove: () => void };

export function FilterBar({ chips, onClearAll }: Readonly<{ chips: FilterChip[]; onClearAll: () => void }>) {
  const { t } = useAdminLanguage();
  if (chips.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-hover"
        >
          {chip.label}
          <X size={12} aria-hidden />
        </button>
      ))}
      {chips.length > 1 ? (
        <button type="button" onClick={onClearAll} className="focus-ring text-xs font-semibold text-ink-muted hover:text-ink hover:underline">
          {t.filterBar.clearAll}
        </button>
      ) : null}
    </div>
  );
}
