import { ChevronRight } from "lucide-react";

export type BreadcrumbItem = { label: string; href?: string };

/**
 * Renders only the ancestor trail - never the current page, since
 * PageHeader's own <h1> already states it. Repeating the page title in both
 * places was a real duplication the design explicitly avoids (and briefly
 * shipped by mistake here: order/product detail pages had the same string
 * in both the last crumb and the <h1>).
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <ChevronRight size={13} aria-hidden className="text-ink-subtle" /> : null}
            {item.href ? (
              <a href={item.href} className="focus-ring rounded hover:text-ink hover:underline">
                {item.label}
              </a>
            ) : (
              <span>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
