"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@aether-commerce/ui";
import { useAdminLanguage } from "../AdminLanguageProvider";
import { fieldLabel } from "./format";
import type { AdminDictionary } from "@aether-commerce/i18n";
import type { ActionDiff } from "./types";

function DiffRow({ field, before, after, t }: { field: string; before: unknown; after: unknown; t: AdminDictionary }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
      <span className="min-w-0 truncate text-ink-subtle">{fieldLabel(t, field)}</span>
      <span className="shrink-0 text-xs text-ink-subtle">-&gt;</span>
      <span className="min-w-0 text-right font-medium text-ink [overflow-wrap:anywhere]">{String(after)}</span>
      <span className="col-span-3 text-xs text-ink-subtle [overflow-wrap:anywhere]">{t.chat.wasValue.replace("{value}", String(before))}</span>
    </div>
  );
}

// The one confirmation surface for every chat-originated mutation - shows
// exactly what was computed server-side (diff, affected count, samples,
// consequences) and requires an explicit click before anything real
// happens. Confirming calls the real confirm endpoint via the chat context;
// this component never mutates anything itself.
export function PendingActionCard({
  operationId,
  diff,
  expiresAt,
  resolved,
  onConfirm
}: {
  operationId: string;
  diff: ActionDiff;
  expiresAt: string;
  resolved: boolean;
  onConfirm: (operationId: string) => void;
}) {
  const { t } = useAdminLanguage();
  const [dismissed, setDismissed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const expired = new Date(expiresAt).getTime() < Date.now();

  if (dismissed) {
    return <p className="text-xs text-ink-subtle">{t.chat.cancelledNothingChanged}</p>;
  }
  if (resolved) {
    return null; // A ReceiptCard for this operationId already shows the outcome.
  }

  function handleConfirm() {
    setConfirming(true);
    onConfirm(operationId);
  }

  return (
    <div className="grid gap-3 rounded-md border border-accent/40 bg-accent-soft/60 p-3">
      <p className="text-sm font-semibold text-ink [overflow-wrap:anywhere]">{diff.summary}</p>
      <div className="grid gap-1.5 rounded-md border border-border bg-surface p-2.5">
        {diff.fields.map((field) => (
          <DiffRow key={field.field} field={field.field} before={field.before} after={field.after} t={t} />
        ))}
        {diff.affectedCount !== undefined ? (
          <p className="text-xs text-ink-muted">
            {(diff.affectedCount === 1 ? t.chat.recordsAffectedOne : t.chat.recordsAffectedOther).replace("{count}", String(diff.affectedCount))}
          </p>
        ) : null}
        {diff.sampleAffected && diff.sampleAffected.length > 0 ? (
          <ul className="grid gap-0.5 text-xs text-ink-subtle">
            {diff.sampleAffected.map((sample) => (
              <li key={sample} className="[overflow-wrap:anywhere]">{sample}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {diff.consequences && diff.consequences.length > 0 ? (
        <ul className="grid gap-1 text-xs text-warning">
          {diff.consequences.map((consequence) => (
            <li key={consequence} className="flex items-start gap-1.5 [overflow-wrap:anywhere]">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
              {consequence}
            </li>
          ))}
        </ul>
      ) : null}

      {expired ? (
        <p className="text-xs text-danger">{t.chat.previewExpired}</p>
      ) : (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            disabled={confirming}
            className="focus-ring min-h-9 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:opacity-50"
          >
            {t.chat.cancel}
          </button>
          <Button type="button" onClick={handleConfirm} disabled={confirming} className="min-h-9 px-3 text-sm">
            {confirming ? t.chat.confirming : t.chat.confirm}
          </Button>
        </div>
      )}
    </div>
  );
}
