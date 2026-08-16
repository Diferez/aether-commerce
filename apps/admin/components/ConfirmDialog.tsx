"use client";

import { useEffect, useRef } from "react";
import { clsx } from "clsx";
import { useAdminLanguage } from "./AdminLanguageProvider";

/**
 * One shared confirmation modal for every destructive/sensitive action in
 * the panel (refunds, suspending an account, changing a role, deleting a
 * product) - replaces the several hand-rolled inline two-step confirm
 * patterns that existed per-page. The mutation call each page makes stays
 * exactly the same; only the confirmation UI is shared.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "default",
  pending = false,
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useAdminLanguage();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    confirmRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? "confirm-dialog-description" : undefined}
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-elevate-md"
        onClick={(event) => event.stopPropagation()}
      >
        <p id="confirm-dialog-title" className="text-base font-semibold text-ink">
          {title}
        </p>
        {description ? (
          <p id="confirm-dialog-description" className="mt-2 text-sm text-ink-muted">
            {description}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring min-h-9 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
          >
            {cancelLabel ?? t.common.cancel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={clsx(
              "focus-ring min-h-9 rounded-md px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50",
              tone === "danger" ? "bg-danger hover:bg-danger/90" : "bg-accent hover:bg-accent-hover"
            )}
          >
            {pending ? t.common.working : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
