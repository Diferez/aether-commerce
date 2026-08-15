import { AlertTriangle } from "lucide-react";

export function ErrorState({
  title = "Could not load this data",
  description = "Try again in a moment.",
  action
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-danger/20 bg-danger-soft p-4 text-sm text-danger">
      <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" />
      <div className="grid gap-1">
        <p className="font-semibold">{title}</p>
        <p>{description}</p>
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    </div>
  );
}
