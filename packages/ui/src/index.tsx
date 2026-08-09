import { useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { formatUsd } from "@aether/core";
import { clsx } from "clsx";

export function Button({
  className,
  variant = "solid",
  children,
  ...props
}: ComponentPropsWithoutRef<"button"> & { children: ReactNode; variant?: "solid" | "outline" | "ghost" }) {
  return (
    <button
      className={clsx(
        "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "solid" && "bg-accent text-white hover:bg-accent-hover",
        variant === "outline" && "border border-border-strong bg-transparent text-ink hover:bg-surface-hover",
        variant === "ghost" && "bg-transparent text-ink hover:bg-surface-hover",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  className,
  variant = "solid",
  children,
  ...props
}: ComponentPropsWithoutRef<"a"> & { children: ReactNode; variant?: "solid" | "outline" | "ghost" }) {
  return (
    <a
      className={clsx(
        "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition",
        variant === "solid" && "bg-accent text-white hover:bg-accent-hover",
        variant === "outline" && "border border-border-strong bg-transparent text-ink hover:bg-surface-hover",
        variant === "ghost" && "bg-transparent text-ink hover:bg-surface-hover",
        className
      )}
      {...props}
    >
      {children}
    </a>
  );
}

export function Surface({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={clsx("rounded-lg border border-border bg-surface p-5", className)}>{children}</section>
  );
}

export function Price({
  cents,
  locale = "en-US",
  className
}: {
  cents: number;
  locale?: string;
  className?: string;
}) {
  return <span className={className}>{formatUsd(cents, locale)}</span>;
}

const badgeTones = {
  neutral: "bg-surface-hover text-ink-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger"
} as const;

export function Badge({
  tone = "neutral",
  className,
  children
}: {
  tone?: keyof typeof badgeTones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Input({
  className,
  ...props
}: ComponentPropsWithoutRef<"input">) {
  return (
    <input
      className={clsx(
        "focus-ring min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle",
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"select"> & { children: ReactNode }) {
  return (
    <select
      className={clsx(
        "focus-ring min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("skeleton rounded-md", className)} />;
}

export function Sheet({
  open,
  onClose,
  side = "right",
  title,
  children
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right" | "bottom";
  title?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const positionClass =
    side === "bottom"
      ? "inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-2xl"
      : side === "left"
        ? "inset-y-0 left-0 h-full w-[min(360px,90vw)]"
        : "inset-y-0 right-0 h-full w-[min(360px,90vw)]";

  return (
    <div className="fixed inset-0 z-50 bg-black/60" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={clsx("focus:outline-none fixed overflow-y-auto border border-border bg-surface p-5 shadow-xl", positionClass)}
        onClick={(event) => event.stopPropagation()}
      >
        {title ? <h2 className="mb-4 text-lg font-semibold text-ink">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}
