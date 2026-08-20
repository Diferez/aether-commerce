import type { LucideIcon } from "lucide-react";

export type ActivityTimelineItem = {
  id: string;
  title: string;
  detail?: string;
  timestamp: string;
  icon?: LucideIcon;
};

export function ActivityTimeline({ items, emptyLabel = "Nothing recorded yet." }: Readonly<{ items: ActivityTimelineItem[]; emptyLabel?: string }>) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-muted">{emptyLabel}</p>;
  }

  return (
    <ol className="grid gap-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <li key={item.id} className="relative flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-ink-muted">
                {Icon ? <Icon size={12} aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
              </span>
              {index < items.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" aria-hidden /> : null}
            </div>
            <div className="grid gap-0.5 pb-4">
              <p className="text-sm font-medium text-ink">{item.title}</p>
              {item.detail ? <p className="text-sm text-ink-muted">{item.detail}</p> : null}
              <p className="text-xs text-ink-subtle">{item.timestamp}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
