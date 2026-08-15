import { AlertTriangle, ArrowRight, HelpCircle } from "lucide-react";
import { StatusBadge } from "../StatusBadge";
import { money, visibilityTone, fulfillmentTone, customerStatusTone } from "./format";
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

function ProductRow({ product }: { product: ProductSummaryArtifact }) {
  return (
    <a href={product.href} className="focus-ring flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover">
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{product.name}</span>
        <span className="block text-xs text-ink-subtle">{product.sku} - {product.category}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums text-ink-muted">{money(product.priceCents)}</span>
        <StatusBadge tone={visibilityTone[product.visibility]}>{product.stock} in stock</StatusBadge>
      </span>
    </a>
  );
}

function OrderRow({ order }: { order: OrderSummaryArtifact }) {
  return (
    <a href={order.href} className="focus-ring flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover">
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{order.number}</span>
        <span className="block text-xs text-ink-subtle">{order.email}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums text-ink-muted">{money(order.totalCents, order.currency)}</span>
        <StatusBadge tone={fulfillmentTone[order.fulfillmentStatus] ?? "neutral"}>{order.fulfillmentStatus}</StatusBadge>
      </span>
    </a>
  );
}

function CustomerRow({ customer }: { customer: CustomerSummaryArtifact }) {
  return (
    <a href={customer.href} className="focus-ring flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover">
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{customer.name ?? customer.email}</span>
        <span className="block text-xs text-ink-subtle">{customer.email}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-ink-muted">{customer.orderCount} order(s)</span>
        <StatusBadge tone={customerStatusTone[customer.status]}>{customer.status}</StatusBadge>
      </span>
    </a>
  );
}

function ActivityRow({ item }: { item: ActivityItemArtifact }) {
  return (
    <div className="rounded-md border border-border px-3 py-2 text-sm">
      <p className="font-medium text-ink">{item.action}</p>
      <p className="text-xs text-ink-subtle">
        {item.targetType}
        {item.targetId ? ` - ${item.targetId}` : ""} - {item.actorId} - {new Date(item.createdAt).toLocaleString()}
      </p>
    </div>
  );
}

export function ToolResultCard({ artifact }: { artifact: ChatArtifact }) {
  switch (artifact.type) {
    case "text":
      return null;

    case "navigate":
      return (
        <a href={artifact.href} className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/20">
          Open {artifact.label} <ArrowRight size={14} aria-hidden />
        </a>
      );

    case "product_list":
      return artifact.products.length === 0 ? (
        <p className="text-sm text-ink-subtle">No products matched.</p>
      ) : (
        <div className="grid gap-1.5">{artifact.products.map((product) => <ProductRow key={product.id} product={product} />)}</div>
      );

    case "product_detail":
      return <ProductRow product={artifact.product} />;

    case "order_list":
      return artifact.orders.length === 0 ? (
        <p className="text-sm text-ink-subtle">No orders matched.</p>
      ) : (
        <div className="grid gap-1.5">{artifact.orders.map((order) => <OrderRow key={order.id} order={order} />)}</div>
      );

    case "order_detail":
      return <OrderRow order={artifact.order} />;

    case "customer_card":
      return <CustomerRow customer={artifact.customer} />;

    case "customer_list":
      return artifact.customers.length === 0 ? (
        <p className="text-sm text-ink-subtle">No customers matched.</p>
      ) : (
        <div className="grid gap-1.5">{artifact.customers.map((customer) => <CustomerRow key={customer.id} customer={customer} />)}</div>
      );

    case "customer_order_history":
      return artifact.orders.length === 0 ? (
        <p className="text-sm text-ink-subtle">No orders yet.</p>
      ) : (
        <div className="grid gap-1.5">{artifact.orders.map((order) => <OrderRow key={order.id} order={order} />)}</div>
      );

    case "dashboard_summary":
      return (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(artifact.summary).map(([key, value]) => (
            <div key={key} className="rounded-md border border-border px-3 py-2">
              <dt className="text-xs text-ink-subtle">{key}</dt>
              <dd className="tabular-nums text-sm font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      );

    case "activity_list":
      return artifact.items.length === 0 ? (
        <p className="text-sm text-ink-subtle">No activity to show.</p>
      ) : (
        <div className="grid gap-1.5">{artifact.items.map((item) => <ActivityRow key={item.id} item={item} />)}</div>
      );

    case "allowed_transitions":
      return (
        <div className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-ink">
          Currently <strong>{artifact.current}</strong>.{" "}
          {artifact.allowed.length > 0 ? <>Can move to: {artifact.allowed.join(", ")}.</> : "No further transitions are possible."}
        </div>
      );

    case "disambiguation":
      return (
        <div className="grid gap-1.5">
          <p className="flex items-center gap-1.5 text-sm text-ink-muted">
            <HelpCircle size={14} aria-hidden /> {artifact.message}
          </p>
          {artifact.options.map((option) => (
            <div key={option.id} className="rounded-md border border-border px-3 py-2 text-sm">
              <p className="font-medium text-ink">{option.label}</p>
              {option.detail ? <p className="text-xs text-ink-subtle">{option.detail}</p> : null}
            </div>
          ))}
        </div>
      );

    case "missing_info":
      return (
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <HelpCircle size={14} aria-hidden /> {artifact.message}
        </p>
      );

    case "error":
      return (
        <p className="flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertTriangle size={14} aria-hidden /> {artifact.message}
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
