"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useAdminLanguage } from "../AdminLanguageProvider";
import { fieldLabel } from "./format";

// Renders only after a real response from the confirm endpoint - never
// synthesized from what the model said. `succeeded`/`failed` come straight
// from the server's outcome, and result fields are shown verbatim so the
// operator can see exactly what changed (e.g. the operationId for their
// own records).
export function ReceiptCard({
  status,
  summary,
  result
}: {
  status: "succeeded" | "failed";
  summary: string;
  result: Record<string, unknown>;
}) {
  const { t } = useAdminLanguage();
  const entries = Object.entries(result).filter(([key]) => key !== "replay");
  return (
    <div className={`grid gap-1.5 rounded-md border p-3 ${status === "succeeded" ? "border-success/40 bg-success-soft/60" : "border-danger/40 bg-danger-soft/60"}`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        {status === "succeeded" ? <CheckCircle2 size={16} className="text-success" aria-hidden /> : <XCircle size={16} className="text-danger" aria-hidden />}
        {status === "succeeded" ? t.chat.receiptDone : t.chat.receiptFailed}
      </p>
      <p className="text-sm text-ink-muted">{summary}</p>
      {entries.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-ink-subtle">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="shrink-0">{fieldLabel(t, key)}</dt>
              <dd className="min-w-0 break-all text-right text-ink">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
