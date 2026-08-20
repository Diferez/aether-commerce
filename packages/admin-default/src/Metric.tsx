import type { LucideIcon } from "lucide-react";

export function Metric({
  label,
  value,
  icon: Icon,
  href,
  hint
}: Readonly<{
  label: string;
  value: string;
  icon?: LucideIcon;
  href?: string;
  /** Only render when there's real, trustworthy context to show - never a fabricated comparison. */
  hint?: string;
}>) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">{label}</p>
        {Icon ? <Icon size={16} className="text-accent" aria-hidden /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-subtle">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <a href={href} className="focus-ring block rounded-lg border border-border bg-surface p-4 transition hover:border-border-strong hover:bg-surface-hover">
        {content}
      </a>
    );
  }

  return <div className="rounded-lg border border-border bg-surface p-4">{content}</div>;
}
