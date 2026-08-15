"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, Boxes, ChevronDown, Download, History, Mail, PackageCheck, Settings, Shield, TicketPercent, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiBaseUrl } from "./config";
import { Metric } from "./Metric";
import { EmptyState } from "./EmptyState";
import { StatusBadge, type StatusTone } from "./StatusBadge";

type ProductSummary = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  lowStockThreshold: number;
  visibility: "draft" | "visible" | "hidden";
};

type OrderSummary = {
  id: string;
  number: string;
  email: string;
  channel: "stripe" | "whatsapp";
  payment_status: "pending" | "paid" | "failed" | "refunded" | "partially_refunded";
  fulfillment_status: "unfulfilled" | "processing" | "shipped" | "delivered" | "cancelled";
  total: number;
  currency: string;
};

type CustomerSummary = {
  id: string;
  source: "registered" | "guest";
  name: string | null;
  email: string;
  status: "active" | "suspended";
  orderCount: number;
};

type Summary = {
  mode: "private" | "demo";
  revenue: number;
  orders: number;
  conversionRate: number;
  lowStock: number;
  notice?: { en: string; es: string };
};

type ContactMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  locale: string;
  email_status: string | null;
  created_at: string;
};

const fallback: Summary = {
  mode: "demo",
  revenue: 1842500,
  orders: 128,
  conversionRate: 4.8,
  lowStock: 7,
  notice: {
    en: "Public demo mode. Changes are disabled.",
    es: "Modo de demostracion publica. Los cambios estan deshabilitados."
  }
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const stockTone: Record<"in" | "low" | "out", StatusTone> = { in: "success", low: "warning", out: "error" };
function stockStatus(product: ProductSummary): { label: string; tone: StatusTone } {
  if (product.stock <= 0) return { label: "Out of stock", tone: stockTone.out };
  if (product.stock <= product.lowStockThreshold) return { label: "Low stock", tone: stockTone.low };
  return { label: "In stock", tone: stockTone.in };
}

export function AdminDashboard({ demo = false }: { demo?: boolean }) {
  const [summary, setSummary] = useState<Summary>(fallback);
  const [status, setStatus] = useState(demo ? "Demo data" : "Private admin");
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [messagesStatus, setMessagesStatus] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);
  const [recentProducts, setRecentProducts] = useState<ProductSummary[]>([]);
  const [productsTotal, setProductsTotal] = useState<number | null>(null);
  const [lowStockProducts, setLowStockProducts] = useState<ProductSummary[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [ordersTotal, setOrdersTotal] = useState<number | null>(null);
  const [ordersStatus, setOrdersStatus] = useState<"loading" | "ready" | "error">("loading");
  const [recentCustomers, setRecentCustomers] = useState<CustomerSummary[]>([]);
  const [customersTotal, setCustomersTotal] = useState<number | null>(null);
  const [customersStatus, setCustomersStatus] = useState<"loading" | "ready" | "error">("loading");
  const { isLoaded, getToken } = useAuth();

  useEffect(() => {
    void fetch(`${apiBaseUrl}/api/v1/admin/products?pageSize=3&sort=updated_at`)
      .then((response) => response.json())
      .then((payload: { success: boolean; data?: { data: ProductSummary[]; pagination: { total: number } } }) => {
        if (payload.success && payload.data) {
          setRecentProducts(payload.data.data);
          setProductsTotal(payload.data.pagination.total);
        }
      })
      .catch(() => {});
    void fetch(`${apiBaseUrl}/api/v1/admin/products?stock=low&pageSize=4`)
      .then((response) => response.json())
      .then((payload: { success: boolean; data?: { data: ProductSummary[] } }) => {
        if (payload.success && payload.data) setLowStockProducts(payload.data.data);
      })
      .catch(() => {});
  }, []);

  async function exportOrdersCsv() {
    const token = await getToken().catch(() => null);
    const response = await fetch(`${apiBaseUrl}/api/v1/admin/export/orders`, {
      headers: token ? { authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "orders-export.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    const path = demo ? "/api/v1/admin/demo/summary" : "/api/v1/admin/summary";
    fetch(`${apiBaseUrl}${path}`)
      .then((response) => response.json())
      .then((payload: { success: boolean; data?: Summary }) => {
        if (payload.success && payload.data) {
          setSummary(payload.data);
          setStatus(payload.data.mode === "demo" ? "Public demo" : "Live private admin");
        }
      })
      .catch(() => setStatus("Offline demo"));
  }, [demo]);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    void (async () => {
      const token = await getToken().catch(() => null);
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/admin/orders?pageSize=4`, {
          headers: token ? { authorization: `Bearer ${token}` } : {}
        });
        if (cancelled) return;
        const payload = (await response.json()) as {
          success: boolean;
          data?: { data: OrderSummary[]; pagination: { total: number } };
        };
        if (payload.success && payload.data) {
          setRecentOrders(payload.data.data);
          setOrdersTotal(payload.data.pagination.total);
          setOrdersStatus("ready");
        } else {
          setOrdersStatus("error");
        }
      } catch {
        if (!cancelled) setOrdersStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    void (async () => {
      const token = await getToken().catch(() => null);
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/admin/users?pageSize=4`, {
          headers: token ? { authorization: `Bearer ${token}` } : {}
        });
        if (cancelled) return;
        const payload = (await response.json()) as {
          success: boolean;
          data?: { data: CustomerSummary[]; pagination: { total: number } };
        };
        if (payload.success && payload.data) {
          setRecentCustomers(payload.data.data);
          setCustomersTotal(payload.data.pagination.total);
          setCustomersStatus("ready");
        } else {
          setCustomersStatus("error");
        }
      } catch {
        if (!cancelled) setCustomersStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    void (async () => {
      const token = await getToken().catch(() => null);
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/admin/contact-messages`, {
          headers: token ? { authorization: `Bearer ${token}` } : {}
        });
        if (cancelled) return;
        if (response.status === 403) {
          setMessagesStatus("forbidden");
          return;
        }
        const payload = (await response.json()) as { success: boolean; data?: ContactMessage[] };
        if (payload.success && payload.data) {
          setMessages(payload.data);
          setMessagesStatus("ready");
        } else {
          setMessagesStatus("error");
        }
      } catch {
        if (!cancelled) setMessagesStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [demo, isLoaded, getToken]);

  const metrics: Array<[string, string, LucideIcon]> = [
    ["Revenue", money(summary.revenue), PackageCheck],
    ["Orders", String(summary.orders), Boxes],
    ["Conversion", `${summary.conversionRate}%`, UsersRound],
    ["Low stock", String(summary.lowStock), AlertTriangle]
  ];

  return (
    <main id="main-content" className="admin-shell py-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-hover">{status}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">{demo ? "Public demo admin" : "Home"}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
            Catalog health, order operations, customer support, and audit events at a glance.
          </p>
        </div>
        <button
          type="button"
          disabled={demo}
          onClick={() => void exportOrdersCsv()}
          className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={17} aria-hidden />
          Export orders CSV
        </button>
      </div>

      {summary.notice ? (
        <section className="mt-5 rounded-lg border border-warning/25 bg-warning-soft p-4 text-sm text-ink">
          <div className="flex gap-3">
            <Shield size={18} aria-hidden className="mt-0.5 shrink-0 text-warning" />
            <div>
              <p className="font-semibold">{summary.notice.en}</p>
              <p className="text-ink-muted">{summary.notice.es}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Metrics">
        {metrics.map(([label, value, Icon]) => (
          <Metric key={label} label={label} value={value} icon={Icon} />
        ))}
      </section>

      <section id="products" className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Products</h2>
            <p className="text-sm text-ink-muted">
              {productsTotal !== null ? `${productsTotal} product${productsTotal === 1 ? "" : "s"} in the catalog.` : "Create, edit, publish and archive products."}
            </p>
          </div>
          <a href="/products/" className="focus-ring min-h-9 shrink-0 rounded-md border border-border-strong px-3 text-sm font-semibold leading-9 text-ink hover:bg-surface-hover">
            View all
          </a>
        </div>
        {recentProducts.length === 0 ? (
          <EmptyState title="No products yet" description="Create the first product to start building the catalog." />
        ) : (
          recentProducts.map((product) => (
            <div key={product.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[1fr_140px_180px] md:items-center">
              <div>
                <h3 className="font-medium text-ink">{product.name}</h3>
                <p className="text-sm text-ink-muted">SKU {product.sku}</p>
              </div>
              <StatusBadge tone={stockStatus(product).tone}>{stockStatus(product).label}</StatusBadge>
              <a
                href={`/products/edit/?id=${encodeURIComponent(product.id)}`}
                className="focus-ring inline-flex min-h-9 items-center justify-center rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                Edit product
              </a>
            </div>
          ))
        )}
      </section>

      <section id="inventory" className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Inventory</h2>
            <p className="text-sm text-ink-muted">
              {summary.lowStock} product{summary.lowStock === 1 ? "" : "s"} at or below its low-stock threshold.
            </p>
          </div>
          <a href="/inventory/" className="focus-ring min-h-9 shrink-0 rounded-md border border-border-strong px-3 text-sm font-semibold leading-9 text-ink hover:bg-surface-hover">
            View all
          </a>
        </div>
        {lowStockProducts.length === 0 ? (
          <EmptyState title="Nothing running low" description="Every product is above its low-stock threshold right now." />
        ) : (
          lowStockProducts.map((product) => (
            <div key={product.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[1fr_140px_180px] md:items-center">
              <div>
                <h3 className="font-medium text-ink">{product.name}</h3>
                <p className="text-sm text-ink-muted">SKU {product.sku}</p>
              </div>
              <span className={`text-sm font-semibold tabular-nums ${product.stock <= 0 ? "text-danger" : "text-warning"}`}>
                {product.stock} left (threshold {product.lowStockThreshold})
              </span>
              <a
                href="/inventory/"
                className="focus-ring inline-flex min-h-9 items-center justify-center rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                Adjust stock
              </a>
            </div>
          ))
        )}
      </section>

      <section id="orders" className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Orders</h2>
            <p className="text-sm text-ink-muted">
              {ordersTotal !== null ? `${ordersTotal} order${ordersTotal === 1 ? "" : "s"} recorded.` : "Fulfillment, payments and refunds."}
            </p>
          </div>
          <a href="/orders/" className="focus-ring min-h-9 shrink-0 rounded-md border border-border-strong px-3 text-sm font-semibold leading-9 text-ink hover:bg-surface-hover">
            View all
          </a>
        </div>
        {ordersStatus === "error" ? (
          <p className="p-4 text-sm text-ink-muted">Could not load recent orders.</p>
        ) : ordersStatus === "loading" ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="skeleton h-12 rounded-md" />
            ))}
          </div>
        ) : recentOrders.length === 0 ? (
          <EmptyState title="No orders yet" description="Orders placed on the storefront or created manually will show up here." />
        ) : (
          recentOrders.map((order) => (
            <div key={order.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[140px_1fr_140px_160px] md:items-center">
              <strong className="text-ink">{order.number}</strong>
              <span className="truncate text-ink-muted">{order.email}</span>
              <span className="text-sm text-ink-muted">
                {order.payment_status.replaceAll("_", " ")} &middot; {order.fulfillment_status.replaceAll("_", " ")}
              </span>
              <a
                href={`/orders/detail/?id=${encodeURIComponent(order.id)}`}
                className="focus-ring inline-flex min-h-9 items-center justify-center rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                Open order
              </a>
            </div>
          ))
        )}
      </section>

      <section id="customers" className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Customers</h2>
            <p className="text-sm text-ink-muted">
              {customersTotal !== null ? `${customersTotal} customer${customersTotal === 1 ? "" : "s"} tracked.` : "Accounts, guest checkouts and access."}
            </p>
          </div>
          <a href="/customers/" className="focus-ring min-h-9 shrink-0 rounded-md border border-border-strong px-3 text-sm font-semibold leading-9 text-ink hover:bg-surface-hover">
            View all
          </a>
        </div>
        {customersStatus === "error" ? (
          <p className="p-4 text-sm text-ink-muted">Could not load recent customers.</p>
        ) : customersStatus === "loading" ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="skeleton h-12 rounded-md" />
            ))}
          </div>
        ) : recentCustomers.length === 0 ? (
          <EmptyState title="No customers yet" description="Registered accounts and guest checkouts will show up here." />
        ) : (
          recentCustomers.map((customer) => (
            <div key={customer.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[1fr_140px_100px_160px] md:items-center">
              <span className="text-ink">{customer.name ?? customer.email}</span>
              <span className="text-sm text-ink-muted">{customer.source === "guest" ? "Guest checkout" : "Registered"}</span>
              <StatusBadge tone={customer.status === "suspended" ? "error" : "success"}>{customer.status}</StatusBadge>
              <a
                href={`/customers/detail/?id=${encodeURIComponent(customer.id)}`}
                className="focus-ring inline-flex min-h-9 items-center justify-center rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                Open customer
              </a>
            </div>
          ))
        )}
      </section>

      <section id="messages" className="mt-6 rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-4">
          <h2 className="text-base font-semibold text-ink">Contact messages</h2>
          <p className="text-sm text-ink-muted">Every submission from the portfolio and storefront contact forms lands here.</p>
        </div>
        {messagesStatus === "forbidden" ? (
          <p className="p-4 text-sm text-ink-muted">
            {demo ? "Public demo mode hides real visitor messages." : "Your role does not have the contacts.read permission."}
          </p>
        ) : messagesStatus === "error" ? (
          <p className="p-4 text-sm text-ink-muted">Could not load contact messages.</p>
        ) : messagesStatus === "loading" ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="skeleton h-12 rounded-md" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <EmptyState title="No messages yet" description="Contact form submissions will appear here as they come in." />
        ) : (
          messages.map((entry) => {
            const isOpen = openMessageId === entry.id;
            return (
              <div key={entry.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpenMessageId(isOpen ? null : entry.id)}
                  aria-expanded={isOpen}
                  className="focus-ring grid w-full gap-1 p-4 text-left md:grid-cols-[1fr_1fr_180px_24px] md:items-center md:gap-3"
                >
                  <span className="font-medium text-ink">{entry.name}</span>
                  <span className="truncate text-sm text-ink-muted">{entry.subject}</span>
                  <span className="text-xs text-ink-subtle">{new Date(entry.created_at).toLocaleString()}</span>
                  <ChevronDown size={16} aria-hidden className={`justify-self-end text-ink-subtle transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen ? (
                  <div className="grid gap-2 border-t border-border bg-surface-hover p-4 text-sm">
                    <p className="flex items-center gap-2 text-ink-muted">
                      <Mail size={14} aria-hidden />
                      <a href={`mailto:${entry.email}`} className="underline">
                        {entry.email}
                      </a>
                      <span className="text-ink-subtle">&middot; {entry.locale}</span>
                    </p>
                    <p className="whitespace-pre-wrap text-ink">{entry.message}</p>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <TicketPercent size={17} aria-hidden />
            Coupons
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Case-insensitive coupons with usage and subtotal rules, managed via the API today.</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-base font-semibold text-ink">Reviews</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Moderation queue for verified or seeded demo reviews, managed via the API today.</p>
        </div>
        <a href="/activity/" className="focus-ring rounded-lg border border-border bg-surface p-5 transition hover:border-border-strong hover:bg-surface-hover">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <History size={17} aria-hidden />
            Activity
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Every privileged action records actor, entity and request ID.</p>
        </a>
        <a href="/settings/" className="focus-ring rounded-lg border border-border bg-surface p-5 transition hover:border-border-strong hover:bg-surface-hover">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Settings size={17} aria-hidden />
            Settings
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Branding, checkout method, shipping, and cart reservation hold time.</p>
        </a>
      </section>
    </main>
  );
}
