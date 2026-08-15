"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, Boxes, ChevronDown, Download, Mail, PackageCheck, Settings, Shield, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiBaseUrl } from "./config";

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

type AdminModule = [title: string, body: string, rows: string[]];

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
          headers: token ? { Authorization: `Bearer ${token}` } : {}
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
          <p className="text-sm font-semibold uppercase text-teal-700">{status}</p>
          <h1 className="mt-1 text-4xl font-semibold text-zinc-950">
            {demo ? "Public demo admin" : "Private admin dashboard"}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            Monitor catalog health, order operations, customer support, coupons, reviews, and audit events.
          </p>
        </div>
        <button
          type="button"
          disabled={demo}
          onClick={() => void exportOrdersCsv()}
          className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          <Download size={17} aria-hidden />
          Export orders CSV
        </button>
      </div>

      {summary.notice ? (
        <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex gap-3">
            <Shield size={18} aria-hidden />
            <div>
              <p className="font-semibold">{summary.notice.en}</p>
              <p>{summary.notice.es}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Metrics">
        {metrics.map(([label, value, Icon]) => (
          <article key={label} className="rounded-lg border border-zinc-200 bg-white p-5">
            <Icon className="text-teal-700" aria-hidden />
            <p className="mt-4 text-sm text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-950">{value}</p>
          </article>
        ))}
      </section>

      <section id="products" className="mt-6 rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
          <div>
            <h2 className="text-lg font-semibold">Products</h2>
            <p className="text-sm text-zinc-500">
              {productsTotal !== null ? `${productsTotal} product${productsTotal === 1 ? "" : "s"} in the catalog.` : "Create, edit, publish and archive products."}
            </p>
          </div>
          <a href="/products/" className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold leading-10">
            View all
          </a>
        </div>
        {recentProducts.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">No products yet.</p>
        ) : (
          recentProducts.map((product) => (
            <div key={product.id} className="grid gap-3 border-b border-zinc-200 p-4 last:border-b-0 md:grid-cols-[1fr_180px_180px] md:items-center">
              <div>
                <h3 className="font-semibold">{product.name}</h3>
                <p className="text-sm text-zinc-500">SKU {product.sku}</p>
              </div>
              <span className="text-sm text-zinc-600">
                {product.stock <= 0 ? "Out of stock" : product.stock <= product.lowStockThreshold ? "Low stock" : "In stock"}
              </span>
              <a
                href={`/products/edit/?id=${encodeURIComponent(product.id)}`}
                className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold"
              >
                Edit product
              </a>
            </div>
          ))
        )}
      </section>

      <section id="inventory" className="mt-6 rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
          <div>
            <h2 className="text-lg font-semibold">Inventory</h2>
            <p className="text-sm text-zinc-500">
              {summary.lowStock} product{summary.lowStock === 1 ? "" : "s"} at or below its low-stock threshold.
            </p>
          </div>
          <a href="/inventory/" className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold leading-10">
            View all
          </a>
        </div>
        {lowStockProducts.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Nothing running low right now.</p>
        ) : (
          lowStockProducts.map((product) => (
            <div key={product.id} className="grid gap-3 border-b border-zinc-200 p-4 last:border-b-0 md:grid-cols-[1fr_140px_180px] md:items-center">
              <div>
                <h3 className="font-semibold">{product.name}</h3>
                <p className="text-sm text-zinc-500">SKU {product.sku}</p>
              </div>
              <span className={product.stock <= 0 ? "text-sm font-semibold text-rose-700" : "text-sm font-semibold text-amber-700"}>
                {product.stock} left (threshold {product.lowStockThreshold})
              </span>
              <a
                href="/inventory/"
                className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold"
              >
                Adjust stock
              </a>
            </div>
          ))
        )}
      </section>

      <section id="orders" className="mt-6 rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
          <div>
            <h2 className="text-lg font-semibold">Orders</h2>
            <p className="text-sm text-zinc-500">
              {ordersTotal !== null ? `${ordersTotal} order${ordersTotal === 1 ? "" : "s"} recorded.` : "Fulfillment, payments and refunds."}
            </p>
          </div>
          <a href="/orders/" className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold leading-10">
            View all
          </a>
        </div>
        {ordersStatus === "error" ? (
          <p className="p-4 text-sm text-zinc-500">Could not load recent orders.</p>
        ) : ordersStatus === "loading" ? (
          <p className="p-4 text-sm text-zinc-500">Loading...</p>
        ) : recentOrders.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">No orders yet.</p>
        ) : (
          recentOrders.map((order) => (
            <div key={order.id} className="grid gap-3 border-b border-zinc-200 p-4 last:border-b-0 md:grid-cols-[140px_1fr_140px_160px] md:items-center">
              <strong>{order.number}</strong>
              <span className="text-zinc-600">{order.email}</span>
              <span className="text-sm text-zinc-600">
                {order.payment_status.replaceAll("_", " ")} &middot; {order.fulfillment_status.replaceAll("_", " ")}
              </span>
              <a
                href={`/orders/detail/?id=${encodeURIComponent(order.id)}`}
                className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold"
              >
                Open order
              </a>
            </div>
          ))
        )}
      </section>

      <section id="customers" className="mt-6 rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
          <div>
            <h2 className="text-lg font-semibold">Customers</h2>
            <p className="text-sm text-zinc-500">
              {customersTotal !== null ? `${customersTotal} customer${customersTotal === 1 ? "" : "s"} tracked.` : "Accounts, guest checkouts and access."}
            </p>
          </div>
          <a href="/customers/" className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold leading-10">
            View all
          </a>
        </div>
        {customersStatus === "error" ? (
          <p className="p-4 text-sm text-zinc-500">Could not load recent customers.</p>
        ) : customersStatus === "loading" ? (
          <p className="p-4 text-sm text-zinc-500">Loading...</p>
        ) : recentCustomers.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">No customers yet.</p>
        ) : (
          recentCustomers.map((customer) => (
            <div key={customer.id} className="grid gap-3 border-b border-zinc-200 p-4 last:border-b-0 md:grid-cols-[1fr_140px_100px_160px] md:items-center">
              <span className="text-zinc-950">{customer.name ?? customer.email}</span>
              <span className="text-sm text-zinc-600">{customer.source === "guest" ? "Guest checkout" : "Registered"}</span>
              <span className={`text-sm font-semibold ${customer.status === "suspended" ? "text-rose-700" : "text-teal-700"}`}>
                {customer.status}
              </span>
              <a
                href={`/customers/detail/?id=${encodeURIComponent(customer.id)}`}
                className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold"
              >
                Open customer
              </a>
            </div>
          ))
        )}
      </section>

      <section id="messages" className="mt-6 rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 p-4">
          <h2 className="text-lg font-semibold">Contact messages</h2>
          <p className="text-sm text-zinc-500">
            Every submission from the portfolio and storefront contact forms lands in the same D1 table.
          </p>
        </div>
        {messagesStatus === "forbidden" ? (
          <p className="p-4 text-sm text-zinc-500">
            {demo
              ? "Public demo mode hides real visitor messages."
              : "Your role does not have the contacts.read permission."}
          </p>
        ) : messagesStatus === "error" ? (
          <p className="p-4 text-sm text-zinc-500">Could not load contact messages.</p>
        ) : messagesStatus === "loading" ? (
          <p className="p-4 text-sm text-zinc-500">Loading...</p>
        ) : messages.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">No messages yet.</p>
        ) : (
          messages.map((entry) => {
            const isOpen = openMessageId === entry.id;
            return (
              <div key={entry.id} className="border-b border-zinc-200 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpenMessageId(isOpen ? null : entry.id)}
                  aria-expanded={isOpen}
                  className="focus-ring grid w-full gap-1 p-4 text-left md:grid-cols-[1fr_1fr_180px_24px] md:items-center md:gap-3"
                >
                  <span className="font-semibold text-zinc-950">{entry.name}</span>
                  <span className="truncate text-sm text-zinc-600">{entry.subject}</span>
                  <span className="text-xs text-zinc-500">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                  <ChevronDown
                    size={16}
                    aria-hidden
                    className={`justify-self-end text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen ? (
                  <div className="grid gap-2 border-t border-zinc-100 bg-zinc-50 p-4 text-sm">
                    <p className="flex items-center gap-2 text-zinc-600">
                      <Mail size={14} aria-hidden />
                      <a href={`mailto:${entry.email}`} className="underline">
                        {entry.email}
                      </a>
                      <span className="text-zinc-400">&middot; {entry.locale}</span>
                    </p>
                    <p className="whitespace-pre-wrap text-zinc-700">{entry.message}</p>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        {([
          ["Coupons", "Case-insensitive coupons with usage and subtotal rules.", ["AETHER10: 10% off", "FREESHIP: simulated", "Usage logged in D1"]],
          ["Reviews", "Moderation queue for verified or seeded demo reviews.", ["2 approved", "1 pending", "Helpful votes tracked"]],
          ["Audit", "Every privileged action records actor, entity and request ID.", ["products.write", "orders.write", "settings.manage"]]
        ] as AdminModule[]).map(([title, body, rows]) => (
          <section key={title} className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
            <div className="mt-4 grid gap-2">
              {rows.map((row) => (
                <div key={row} className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-600">
                  {row}
                </div>
              ))}
            </div>
            <button disabled={demo} className="focus-ring mt-4 min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
              Open module
            </button>
          </section>
        ))}

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Settings size={17} aria-hidden />
            Settings
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Branding, checkout method, shipping, and cart reservation hold time.
          </p>
          <a
            href="/settings/"
            className="focus-ring mt-4 inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold"
          >
            Open settings
          </a>
        </section>
      </section>
    </main>
  );
}
