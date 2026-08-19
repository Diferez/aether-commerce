import { AlertTriangle, ArrowRight, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { StatusBadge } from "../StatusBadge";
import {
  money,
  visibilityTone,
  fulfillmentTone,
  customerStatusTone,
  healthLevelTone,
  statFieldLabel,
  formatStatValue,
  activityActionLabel,
  activityActorClause
} from "./format";
import { useAdminLanguage } from "../AdminLanguageProvider";
import type { AdminDictionary } from "@aether/i18n";
import type {
  ActivityItemArtifact,
  ChatArtifact,
  CustomerSummaryArtifact,
  OrderSummaryArtifact,
  ProductSummaryArtifact
} from "./types";

// Every branch below maps one known, backend-controlled artifact `type` to
// real markup - never dangerouslySetInnerHTML, never a model-generated
// string rendered as HTML. Links are plain <a href> (static export, no
// client router, same convention as CommandMenu's search results).

function ProductRow({ product, t }: { product: ProductSummaryArtifact; t: AdminDictionary }) {
  return (
    <a href={product.href} className="focus-ring flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover">
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{product.name}</span>
        <span className="block text-xs text-ink-subtle">{product.sku} - {product.category}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums text-ink-muted">{money(product.priceCents)}</span>
        <StatusBadge tone={visibilityTone[product.visibility]}>{t.chat.inStock.replace("{count}", String(product.stock))}</StatusBadge>
      </span>
    </a>
  );
}

function orderStatusLabel(t: AdminDictionary, value: string) {
  const raw = t.orderStatus[value as keyof AdminDictionary["orderStatus"]] ?? value;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function OrderRow({ order, t }: { order: OrderSummaryArtifact; t: AdminDictionary }) {
  return (
    <a href={order.href} className="focus-ring flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover">
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{order.number}</span>
        <span className="block text-xs text-ink-subtle">{order.email}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums text-ink-muted">{money(order.totalCents, order.currency)}</span>
        <StatusBadge tone={fulfillmentTone[order.fulfillmentStatus] ?? "neutral"}>{orderStatusLabel(t, order.fulfillmentStatus)}</StatusBadge>
      </span>
    </a>
  );
}

function CustomerRow({ customer, t }: { customer: CustomerSummaryArtifact; t: AdminDictionary }) {
  return (
    <a href={customer.href} className="focus-ring flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover">
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{customer.name ?? customer.email}</span>
        <span className="block text-xs text-ink-subtle">{customer.email}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-ink-muted">{t.chat.ordersCountLabel.replace("{count}", String(customer.orderCount))}</span>
        <StatusBadge tone={customerStatusTone[customer.status]}>{t.customerStatus[customer.status]}</StatusBadge>
      </span>
    </a>
  );
}

const healthStatusIcon = { operational: CheckCircle2, degraded: AlertTriangle, critical: XCircle, unknown: HelpCircle };

function healthStatusLabel(t: AdminDictionary, status: string): string {
  switch (status) {
    case "operational":
      return t.systemHealthPage.levelOperational;
    case "degraded":
      return t.systemHealthPage.levelDegraded;
    case "critical":
      return t.systemHealthPage.levelCritical;
    default:
      return t.systemHealthPage.statNoData;
  }
}

function HealthStatusBadge({ status, t }: { status: string; t: AdminDictionary }) {
  const Icon = healthStatusIcon[status as keyof typeof healthStatusIcon] ?? HelpCircle;
  return (
    <StatusBadge tone={healthLevelTone[status] ?? "neutral"} icon={Icon}>
      {healthStatusLabel(t, status)}
    </StatusBadge>
  );
}

function IssueRow({ issue }: { issue: { name: string; level: "critical" | "degraded"; reason: string } }) {
  const critical = issue.level === "critical";
  return (
    <div className={`rounded-md border px-3 py-2 text-sm [overflow-wrap:anywhere] ${critical ? "border-danger/40 bg-danger-soft" : "border-warning/40 bg-warning-soft"}`}>
      <p className={`font-medium capitalize ${critical ? "text-danger" : "text-warning"}`}>{issue.name}</p>
      <p className="text-xs text-ink-muted">{issue.reason}</p>
    </div>
  );
}

function ActivityRow({ item, locale, t }: { item: ActivityItemArtifact; locale: string; t: AdminDictionary }) {
  // Primary line is a plain-language sentence (see format.ts's
  // activityActionLabel) instead of the raw dotted action code - the store
  // owner reading this card has no reason to know what "order.
  // fulfillment_changed" means. The actor clause is included only when it
  // resolves to something a human recognizes (a role, or a known automated
  // actor) - an opaque Clerk user id is omitted rather than shown as if it
  // meant something (see activityActorClause).
  const actorClause = activityActorClause(t, item);
  const when = new Date(item.createdAt).toLocaleString(locale === "es" ? "es-ES" : "en-US");
  return (
    <div className="min-w-0 rounded-md border border-border px-3 py-2 text-sm">
      <p className="font-medium text-ink [overflow-wrap:anywhere]">{activityActionLabel(t, item)}</p>
      <p className="text-xs text-ink-subtle [overflow-wrap:anywhere]">
        {actorClause ? `${actorClause} - ` : ""}
        {when}
      </p>
    </div>
  );
}

export function ToolResultCard({ artifact }: { artifact: ChatArtifact }) {
  const { t, locale } = useAdminLanguage();
  switch (artifact.type) {
    case "text":
      return null;

    case "navigate":
      return (
        <a href={artifact.href} className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/20">
          {t.chat.openLabel.replace("{label}", artifact.label)} <ArrowRight size={14} aria-hidden />
        </a>
      );

    case "product_list":
      return artifact.products.length === 0 ? (
        <p className="text-sm text-ink-subtle">{t.chat.noProductsMatched}</p>
      ) : (
        <div className="grid gap-1.5">{artifact.products.map((product) => <ProductRow key={product.id} product={product} t={t} />)}</div>
      );

    case "product_detail":
      return <ProductRow product={artifact.product} t={t} />;

    case "order_list":
      return artifact.orders.length === 0 ? (
        <p className="text-sm text-ink-subtle">{t.chat.noOrdersMatched}</p>
      ) : (
        <div className="grid gap-1.5">{artifact.orders.map((order) => <OrderRow key={order.id} order={order} t={t} />)}</div>
      );

    case "order_detail":
      return <OrderRow order={artifact.order} t={t} />;

    case "customer_card":
      return <CustomerRow customer={artifact.customer} t={t} />;

    case "customer_list":
      return artifact.customers.length === 0 ? (
        <p className="text-sm text-ink-subtle">{t.chat.noCustomersMatched}</p>
      ) : (
        <div className="grid gap-1.5">{artifact.customers.map((customer) => <CustomerRow key={customer.id} customer={customer} t={t} />)}</div>
      );

    case "customer_order_history":
      return artifact.orders.length === 0 ? (
        <p className="text-sm text-ink-subtle">{t.chat.noOrdersYet}</p>
      ) : (
        <div className="grid gap-1.5">{artifact.orders.map((order) => <OrderRow key={order.id} order={order} t={t} />)}</div>
      );

    case "dashboard_summary": {
      // "status" (only ever set by get_system_health) renders as a badge,
      // not a grid cell - every other stat falls through to the generic grid.
      const { status, ...stats } = artifact.summary;
      const statEntries = Object.entries(stats);
      return (
        <div className="grid gap-2">
          {typeof status === "string" ? <HealthStatusBadge status={status} t={t} /> : null}
          {artifact.issues && artifact.issues.length > 0 ? (
            <div className="grid gap-1.5">
              {artifact.issues.map((issue) => (
                <IssueRow key={issue.name} issue={issue} />
              ))}
            </div>
          ) : null}
          {statEntries.length > 0 ? (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {statEntries.map(([key, value]) => (
                <div key={key} className="min-w-0 rounded-md border border-border px-3 py-2">
                  <dt className="text-xs text-ink-subtle">{statFieldLabel(t, key)}</dt>
                  <dd className="tabular-nums text-sm font-semibold text-ink [overflow-wrap:anywhere]">{formatStatValue(t, key, value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {artifact.relatedOrders && artifact.relatedOrders.length > 0 ? (
            <div className="grid gap-1.5">
              {artifact.relatedOrders.map((order) => (
                <OrderRow key={order.id} order={order} t={t} />
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    case "activity_list":
      return artifact.items.length === 0 ? (
        <p className="text-sm text-ink-subtle">{t.chat.noActivityToShow}</p>
      ) : (
        <div className="grid gap-1.5">{artifact.items.map((item) => <ActivityRow key={item.id} item={item} locale={locale} t={t} />)}</div>
      );

    case "allowed_transitions":
      return (
        <div className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-ink [overflow-wrap:anywhere]">
          {t.chat.currentlyStatus.replace("{status}", artifact.current)}{" "}
          {artifact.allowed.length > 0 ? t.chat.canMoveTo.replace("{options}", artifact.allowed.join(", ")) : t.chat.noFurtherTransitions}
        </div>
      );

    case "disambiguation":
      return (
        <div className="grid gap-1.5">
          <p className="flex items-start gap-1.5 text-sm text-ink-muted [overflow-wrap:anywhere]">
            <HelpCircle size={14} className="mt-0.5 shrink-0" aria-hidden /> {artifact.message}
          </p>
          {artifact.options.map((option) => (
            <div key={option.id} className="min-w-0 rounded-md border border-border px-3 py-2 text-sm [overflow-wrap:anywhere]">
              <p className="font-medium text-ink">{option.label}</p>
              {option.detail ? <p className="text-xs text-ink-subtle">{option.detail}</p> : null}
            </div>
          ))}
        </div>
      );

    case "missing_info":
      return (
        <p className="flex items-start gap-1.5 text-sm text-ink-muted [overflow-wrap:anywhere]">
          <HelpCircle size={14} className="mt-0.5 shrink-0" aria-hidden /> {artifact.message}
        </p>
      );

    case "error":
      return (
        <p className="flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger [overflow-wrap:anywhere]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {artifact.message}
        </p>
      );

    // pending_action and receipt render via their own dedicated components
    // (PendingActionCard/ReceiptCard) from MessageList, not here.
    case "pending_action":
    case "receipt":
      return null;

    default:
      return null;
  }
}
