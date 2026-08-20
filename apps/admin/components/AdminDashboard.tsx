"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, Boxes, ChevronDown, Download, History, Mail, PackageCheck, Settings, Shield, TicketPercent, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiBaseUrl } from "./config";
import { CheckoutProviderSettings } from "./CheckoutProviderSettings";
import { IntegrationSecretsSettings } from "./IntegrationSecretsSettings";
import { Metric } from "./Metric";
import { EmptyState } from "./EmptyState";
import { StatusBadge, type StatusTone } from "./StatusBadge";
import { useAdminLanguage } from "./AdminLanguageProvider";
import type { AdminDictionary } from "@aether/i18n";

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
  channel: "stripe" | "wompi" | "whatsapp";
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
  // null on the real (private) summary - nothing in this codebase records
  // storefront pageviews/sessions, so there is no real conversion rate to
  // compute. Only ever a number on the demo-mode fallback below, whose
  // figures are illustrative by design.
  conversionRate: number | null;
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

function money(cents: number, locale: string) {
  return new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const stockTone: Record<"in" | "low" | "out", StatusTone> = { in: "success", low: "warning", out: "error" };
function stockStatus(product: ProductSummary, t: AdminDictionary): { label: string; tone: StatusTone } {
  if (product.stock <= 0) return { label: t.dashboard.outOfStock, tone: stockTone.out };
  if (product.stock <= product.lowStockThreshold) return { label: t.dashboard.lowStock, tone: stockTone.low };
  return { label: t.dashboard.inStock, tone: stockTone.in };
}

type StatusKey = "statusDemoData" | "statusPrivateAdmin" | "statusPublicDemo" | "statusLivePrivateAdmin" | "statusOfflineDemo";

export function AdminDashboard({ demo = false }: { demo?: boolean }) {
  const { t, locale } = useAdminLanguage();
  const [summary, setSummary] = useState<Summary>(fallback);
  const [statusKey, setStatusKey] = useState<StatusKey>(demo ? "statusDemoData" : "statusPrivateAdmin");
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
          setStatusKey(payload.data.mode === "demo" ? "statusPublicDemo" : "statusLivePrivateAdmin");
        }
      })
      .catch(() => setStatusKey("statusOfflineDemo"));
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
    [t.dashboard.metricRevenue, money(summary.revenue, locale), PackageCheck],
    [t.dashboard.metricOrders, String(summary.orders), Boxes],
    [t.dashboard.metricConversion, summary.conversionRate === null ? t.dashboard.metricConversionUnavailable : `${summary.conversionRate}%`, UsersRound],
    [t.dashboard.metricLowStock, String(summary.lowStock), AlertTriangle]
  ];

  return (
    <main id="main-content" className="admin-shell py-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-hover">{t.dashboard[statusKey]}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">{demo ? t.dashboard.publicDemoAdmin : t.dashboard.home}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{t.dashboard.subtitle}</p>
        </div>
        <button
          type="button"
          disabled={demo}
          onClick={() => void exportOrdersCsv()}
          className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={17} aria-hidden />
          {t.dashboard.exportOrdersCsv}
        </button>
      </div>

      {summary.notice ? (
        <section className="mt-5 rounded-lg border border-warning/25 bg-warning-soft p-4 text-sm text-ink">
          <div className="flex gap-3">
            <Shield size={18} aria-hidden className="mt-0.5 shrink-0 text-warning" />
            <p className="font-semibold">{summary.notice[locale]}</p>
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t.dashboard.metricsLabel}>
        {metrics.map(([label, value, Icon]) => (
          <Metric key={label} label={label} value={value} icon={Icon} />
        ))}
      </section>

      <section id="products" className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{t.dashboard.productsHeading}</h2>
            <p className="text-sm text-ink-muted">
              {productsTotal !== null
                ? (productsTotal === 1 ? t.dashboard.productsCountOne : t.dashboard.productsCountOther).replace("{count}", String(productsTotal))
                : t.dashboard.productsSubtitleFallback}
            </p>
          </div>
          <a href="/products/" className="focus-ring min-h-9 shrink-0 rounded-md border border-border-strong px-3 text-sm font-semibold leading-9 text-ink hover:bg-surface-hover">
            {t.common.viewAll}
          </a>
        </div>
        {recentProducts.length === 0 ? (
          <EmptyState title={t.dashboard.noProductsYetTitle} description={t.dashboard.noProductsYetDescription} />
        ) : (
          recentProducts.map((product) => (
            <div key={product.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[1fr_140px_180px] md:items-center">
              <div>
                <h3 className="font-medium text-ink">{product.name}</h3>
                <p className="text-sm text-ink-muted">SKU {product.sku}</p>
              </div>
              <StatusBadge tone={stockStatus(product, t).tone}>{stockStatus(product, t).label}</StatusBadge>
              <a
                href={`/products/edit/?id=${encodeURIComponent(product.id)}`}
                className="focus-ring inline-flex min-h-9 items-center justify-center rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                {t.dashboard.editProduct}
              </a>
            </div>
          ))
        )}
      </section>

      <section id="inventory" className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{t.dashboard.inventoryHeading}</h2>
            <p className="text-sm text-ink-muted">
              {(summary.lowStock === 1 ? t.dashboard.inventoryCountOne : t.dashboard.inventoryCountOther).replace("{count}", String(summary.lowStock))}
            </p>
          </div>
          <a href="/inventory/" className="focus-ring min-h-9 shrink-0 rounded-md border border-border-strong px-3 text-sm font-semibold leading-9 text-ink hover:bg-surface-hover">
            {t.common.viewAll}
          </a>
        </div>
        {lowStockProducts.length === 0 ? (
          <EmptyState title={t.dashboard.nothingRunningLowTitle} description={t.dashboard.nothingRunningLowDescription} />
        ) : (
          lowStockProducts.map((product) => (
            <div key={product.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[1fr_140px_180px] md:items-center">
              <div>
                <h3 className="font-medium text-ink">{product.name}</h3>
                <p className="text-sm text-ink-muted">SKU {product.sku}</p>
              </div>
              <span className={`text-sm font-semibold tabular-nums ${product.stock <= 0 ? "text-danger" : "text-warning"}`}>
                {t.dashboard.leftThreshold.replace("{count}", String(product.stock)).replace("{threshold}", String(product.lowStockThreshold))}
              </span>
              <a
                href="/inventory/"
                className="focus-ring inline-flex min-h-9 items-center justify-center rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                {t.dashboard.adjustStock}
              </a>
            </div>
          ))
        )}
      </section>

      <section id="orders" className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{t.dashboard.ordersHeading}</h2>
            <p className="text-sm text-ink-muted">
              {ordersTotal !== null
                ? (ordersTotal === 1 ? t.dashboard.ordersCountOne : t.dashboard.ordersCountOther).replace("{count}", String(ordersTotal))
                : t.dashboard.ordersSubtitleFallback}
            </p>
          </div>
          <a href="/orders/" className="focus-ring min-h-9 shrink-0 rounded-md border border-border-strong px-3 text-sm font-semibold leading-9 text-ink hover:bg-surface-hover">
            {t.common.viewAll}
          </a>
        </div>
        {ordersStatus === "error" ? (
          <p className="p-4 text-sm text-ink-muted">{t.dashboard.couldNotLoadOrders}</p>
        ) : ordersStatus === "loading" ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="skeleton h-12 rounded-md" />
            ))}
          </div>
        ) : recentOrders.length === 0 ? (
          <EmptyState title={t.dashboard.noOrdersYetTitle} description={t.dashboard.noOrdersYetDescription} />
        ) : (
          recentOrders.map((order) => (
            <div key={order.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[140px_1fr_140px_160px] md:items-center">
              <strong className="text-ink">{order.number}</strong>
              <span className="truncate text-ink-muted">{order.email}</span>
              <span className="text-sm text-ink-muted">
                {t.orderStatus[order.payment_status]} &middot; {t.orderStatus[order.fulfillment_status]}
              </span>
              <a
                href={`/orders/detail/?id=${encodeURIComponent(order.id)}`}
                className="focus-ring inline-flex min-h-9 items-center justify-center rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                {t.dashboard.openOrder}
              </a>
            </div>
          ))
        )}
      </section>

      <section id="customers" className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{t.dashboard.customersHeading}</h2>
            <p className="text-sm text-ink-muted">
              {customersTotal !== null
                ? (customersTotal === 1 ? t.dashboard.customersCountOne : t.dashboard.customersCountOther).replace("{count}", String(customersTotal))
                : t.dashboard.customersSubtitleFallback}
            </p>
          </div>
          <a href="/customers/" className="focus-ring min-h-9 shrink-0 rounded-md border border-border-strong px-3 text-sm font-semibold leading-9 text-ink hover:bg-surface-hover">
            {t.common.viewAll}
          </a>
        </div>
        {customersStatus === "error" ? (
          <p className="p-4 text-sm text-ink-muted">{t.dashboard.couldNotLoadCustomers}</p>
        ) : customersStatus === "loading" ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="skeleton h-12 rounded-md" />
            ))}
          </div>
        ) : recentCustomers.length === 0 ? (
          <EmptyState title={t.dashboard.noCustomersYetTitle} description={t.dashboard.noCustomersYetDescription} />
        ) : (
          recentCustomers.map((customer) => (
            <div key={customer.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[1fr_140px_100px_160px] md:items-center">
              <span className="text-ink">{customer.name ?? customer.email}</span>
              <span className="text-sm text-ink-muted">{customer.source === "guest" ? t.dashboard.guestCheckout : t.dashboard.registered}</span>
              <StatusBadge tone={customer.status === "suspended" ? "error" : "success"}>{t.customerStatus[customer.status]}</StatusBadge>
              <a
                href={`/customers/detail/?id=${encodeURIComponent(customer.id)}`}
                className="focus-ring inline-flex min-h-9 items-center justify-center rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover"
              >
                {t.dashboard.openCustomer}
              </a>
            </div>
          ))
        )}
      </section>

      <section id="messages" className="mt-6 rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-4">
          <h2 className="text-base font-semibold text-ink">{t.dashboard.contactMessagesHeading}</h2>
          <p className="text-sm text-ink-muted">{t.dashboard.contactMessagesSubtitle}</p>
        </div>
        {messagesStatus === "forbidden" ? (
          <p className="p-4 text-sm text-ink-muted">
            {demo ? t.dashboard.demoHidesMessages : t.dashboard.noContactPermission}
          </p>
        ) : messagesStatus === "error" ? (
          <p className="p-4 text-sm text-ink-muted">{t.dashboard.couldNotLoadMessages}</p>
        ) : messagesStatus === "loading" ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="skeleton h-12 rounded-md" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <EmptyState title={t.dashboard.noMessagesYetTitle} description={t.dashboard.noMessagesYetDescription} />
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
                  <span className="text-xs text-ink-subtle">{new Date(entry.created_at).toLocaleString(locale === "es" ? "es-ES" : "en-US")}</span>
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

      {!demo ? <CheckoutProviderSettings /> : null}
      {!demo ? <IntegrationSecretsSettings /> : null}

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <TicketPercent size={17} aria-hidden />
            {t.dashboard.couponsHeading}
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{t.dashboard.couponsDescription}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-base font-semibold text-ink">{t.dashboard.reviewsHeading}</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{t.dashboard.reviewsDescription}</p>
        </div>
        <a href="/activity/" className="focus-ring rounded-lg border border-border bg-surface p-5 transition hover:border-border-strong hover:bg-surface-hover">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <History size={17} aria-hidden />
            {t.dashboard.activityHeading}
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{t.dashboard.activityDescription}</p>
        </a>
        <a href="/settings/" className="focus-ring rounded-lg border border-border bg-surface p-5 transition hover:border-border-strong hover:bg-surface-hover">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Settings size={17} aria-hidden />
            {t.dashboard.settingsHeading}
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{t.dashboard.settingsDescription}</p>
        </a>
      </section>
    </main>
  );
}
