"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@aether/ui";
import type { ActionDiff } from "./types";

function DiffRow({ field, before, after }: { field: string; before: unknown; after: unknown }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
      <span className="truncate text-ink-subtle">{field}</span>
      <span className="text-xs text-ink-subtle">-&gt;</span>
      <span className="truncate text-right font-medium text-ink">{String(after)}</span>
      <span className="col-span-3 text-xs text-ink-subtle">was: {String(before)}</span>
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
  const [dismissed, setDismissed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const expired = new Date(expiresAt).getTime() < Date.now();

  if (dismissed) {
    return <p className="text-xs text-ink-subtle">Cancelled - nothing was changed.</p>;
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
      <p className="text-sm font-semibold text-ink">{diff.summary}</p>
      <div className="grid gap-1.5 rounded-md border border-border bg-surface p-2.5">
        {diff.fields.map((field) => (
          <DiffRow key={field.field} field={field.field} before={field.before} after={field.after} />
        ))}
        {diff.affectedCount !== undefined ? (
          <p className="text-xs text-ink-muted">{diff.affectedCount} record(s) affected.</p>
        ) : null}
        {diff.sampleAffected && diff.sampleAffected.length > 0 ? (
          <ul className="grid gap-0.5 text-xs text-ink-subtle">
            {diff.sampleAffected.map((sample) => (
              <li key={sample}>{sample}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {diff.consequences && diff.consequences.length > 0 ? (
        <ul className="grid gap-1 text-xs text-warning">
          {diff.consequences.map((consequence) => (
            <li key={consequence} className="flex items-start gap-1.5">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
              {consequence}
            </li>
          ))}
        </ul>
      ) : null}

      {expired ? (
        <p className="text-xs text-danger">This preview expired. Ask again to get a fresh one.</p>
      ) : (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            disabled={confirming}
            className="focus-ring min-h-9 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <Button type="button" onClick={handleConfirm} disabled={confirming} className="min-h-9 px-3 text-sm">
            {confirming ? "Confirming..." : "Confirm"}
          </Button>
        </div>
      )}
    </div>
  );
}
