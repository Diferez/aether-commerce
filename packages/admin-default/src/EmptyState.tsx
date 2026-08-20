import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: Readonly<{
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}>) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {Icon ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-hover text-ink-subtle">
          <Icon size={20} aria-hidden />
        </span>
      ) : null}
      <div className="grid gap-1">
        <p className="font-semibold text-ink">{title}</p>
        {description ? <p className="mx-auto max-w-sm text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
