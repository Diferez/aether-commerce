import type { ReactNode } from "react";

type ProductBadgeVariant = "discount" | "status" | "featured";
type ProductBadgeTone = "danger" | "warning" | "accent";

const variantClasses: Record<ProductBadgeVariant, string | Record<string, string>> = {
  discount: "rounded-md bg-accent px-2 py-1 text-xs font-medium text-white",
  status: {
    danger: "rounded-md bg-ink px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-surface",
    warning: "rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning",
    accent: "rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent"
  },
  featured: "rounded-md bg-accent-2 px-2 py-1 text-xs font-medium text-white"
};

// Status (out-of-stock/low-stock) always wins over a discount badge in the
// same card - a discount you can't act on is noise, not information.
export function ProductBadge({
  variant,
  tone = "accent",
  className = "",
  children
}: {
  variant: ProductBadgeVariant;
  tone?: ProductBadgeTone;
  className?: string;
  children: ReactNode;
}) {
  const variantClass = variantClasses[variant];
  const toneClass = typeof variantClass === "string" ? variantClass : variantClass[tone];

  return (
    <span className={`inline-flex items-center [font-variant-numeric:tabular-nums] ${toneClass} ${className}`}>
      {children}
    </span>
  );
}
