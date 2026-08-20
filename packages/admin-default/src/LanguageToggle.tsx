"use client";

import { Languages } from "lucide-react";
import { useAdminLanguage } from "./AdminLanguageProvider";

export function LanguageToggle({
  className,
  label
}: {
  className?: string;
  /** When provided, renders as a full-width labeled row (sidebar footer) instead of an icon-only square button. */
  label?: boolean;
}) {
  const { locale, setLocale, t } = useAdminLanguage();
  const next = locale === "en" ? "es" : "en";
  const ariaLabel = locale === "en" ? t.languageToggle.switchToSpanish : t.languageToggle.switchToEnglish;

  if (label) {
    return (
      <button
        type="button"
        onClick={() => setLocale(next)}
        aria-pressed={locale === "es"}
        className={
          className ??
          "focus-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-ink hover:bg-surface-hover"
        }
      >
        <Languages size={16} aria-hidden />
        {ariaLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={ariaLabel}
      aria-pressed={locale === "es"}
      className={
        className ??
        "focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-xs font-semibold uppercase text-ink-muted hover:bg-surface-hover hover:text-ink"
      }
    >
      {locale.toUpperCase()}
    </button>
  );
}
