import type { LucideIcon } from "lucide-react";
import { clsx } from "clsx";

export type StatusTone = "neutral" | "info" | "pending" | "in-process" | "success" | "warning" | "error" | "archived";

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-surface-hover text-ink-muted",
  info: "bg-info-soft text-info",
  pending: "bg-warning-soft text-warning",
  "in-process": "bg-accent-2-soft text-accent-2",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  error: "bg-danger-soft text-danger",
  archived: "bg-surface-hover text-ink-subtle"
};

/**
 * Single source of truth for every status pill in the panel. Each page maps
 * its own real business status string to one of these 8 tones - the tone
 * meaning stays fixed across every module (see StatusBadge mapping notes in
 * the design plan), only the visible label text changes per page.
 */
export function StatusBadge({
  tone,
  children,
  icon: Icon,
  className
}: {
  tone: StatusTone;
  children: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", toneClasses[tone], className)}>
      {Icon ? <Icon size={12} aria-hidden /> : null}
      {children}
    </span>
  );
}
