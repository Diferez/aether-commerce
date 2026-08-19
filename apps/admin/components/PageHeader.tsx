import { Breadcrumbs, type BreadcrumbItem } from "./Breadcrumbs";

export function PageHeader({
  title,
  description,
  breadcrumb,
  primaryAction,
  secondaryActions,
  meta
}: {
  title: string;
  description?: string;
  breadcrumb?: BreadcrumbItem[];
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  /** Small inline items next to the title, e.g. status badges on a detail page. */
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumb ? <Breadcrumbs items={breadcrumb} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
            {meta}
          </div>
          {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
        </div>
        {primaryAction || secondaryActions ? (
          <div className="flex shrink-0 items-center gap-2">
            {secondaryActions}
            {primaryAction}
          </div>
        ) : null}
      </div>
    </div>
  );
}
