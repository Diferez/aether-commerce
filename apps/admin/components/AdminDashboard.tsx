"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { AlertTriangle, Boxes, ChevronDown, Download, Mail, MessageCircle, PackageCheck, Shield, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiBaseUrl } from "./config";

type CheckoutSettings = {
  paymentMode: "stripe" | "whatsapp";
  whatsappNumber: string;
  whatsappMessageTemplate: string;
};

type BrandSettings = {
  name: string;
  tagline: { en: string; es: string };
  logoUrl: string;
  primaryColor: string;
  portfolioUrl: string;
  features: { reviews: boolean };
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
  const [checkoutForm, setCheckoutForm] = useState<CheckoutSettings>({
    paymentMode: "stripe",
    whatsappNumber: "",
    whatsappMessageTemplate: ""
  });
  const [checkoutSaveStatus, setCheckoutSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [brandForm, setBrandForm] = useState<BrandSettings>({
    name: "Aether",
    tagline: { en: "Technology, elevated.", es: "Tecnologia a otro nivel." },
    logoUrl: "",
    primaryColor: "#8b5cf6",
    portfolioUrl: "",
    features: { reviews: true }
  });
  const [brandSaveStatus, setBrandSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const { isLoaded, getToken } = useAuth();

  useEffect(() => {
    void fetch(`${apiBaseUrl}/api/v1/checkout/options`)
      .then((response) => response.json())
      .then((payload: { success: boolean; data?: CheckoutSettings }) => {
        if (payload.success && payload.data) setCheckoutForm(payload.data);
      })
      .catch(() => {});
    void fetch(`${apiBaseUrl}/api/v1/brand`)
      .then((response) => response.json())
      .then((payload: { success: boolean; data?: BrandSettings }) => {
        if (payload.success && payload.data) setBrandForm(payload.data);
      })
      .catch(() => {});
  }, []);

  async function saveBrandSettings() {
    setBrandSaveStatus("saving");
    const token = await getToken().catch(() => null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/settings/brand`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(brandForm)
      });
      const payload = (await response.json()) as { success: boolean };
      setBrandSaveStatus(payload.success ? "saved" : "error");
    } catch {
      setBrandSaveStatus("error");
    }
  }

  async function saveCheckoutSettings() {
    setCheckoutSaveStatus("saving");
    const token = await getToken().catch(() => null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/settings/checkout`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(checkoutForm)
      });
      const payload = (await response.json()) as { success: boolean };
      setCheckoutSaveStatus(payload.success ? "saved" : "error");
    } catch {
      setCheckoutSaveStatus("error");
    }
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
    <main className="admin-shell py-8">
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
        <button disabled={demo} className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400">
          <Download size={17} aria-hidden />
          Export CSV
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
        <div className="border-b border-zinc-200 p-4">
          <h2 className="text-lg font-semibold">Catalog overrides</h2>
          <p className="text-sm text-zinc-500">Use private admin to update flags, visibility, copy, and inventory rules.</p>
        </div>
        {["Aether Arc Laptop", "Aether Dock Studio", "Aether Pulse Headset"].map((product, index) => (
          <div key={product} className="grid gap-3 border-b border-zinc-200 p-4 last:border-b-0 md:grid-cols-[1fr_180px_180px] md:items-center">
            <div>
              <h3 className="font-semibold">{product}</h3>
              <p className="text-sm text-zinc-500">Override status: {index === 1 ? "featured" : "standard"}</p>
            </div>
            <span className="text-sm text-zinc-600">{index === 2 ? "Low stock" : "In stock"}</span>
            <button disabled={demo} className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
              Edit override
            </button>
          </div>
        ))}
      </section>

      <section id="orders" className="mt-6 rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 p-4">
          <h2 className="text-lg font-semibold">Order operations</h2>
        </div>
        {["reserved", "paid", "fulfillment_pending", "shipped"].map((state, index) => (
          <div key={state} className="grid gap-3 border-b border-zinc-200 p-4 last:border-b-0 md:grid-cols-[140px_1fr_160px]">
            <strong>AET-{20260700 + index}</strong>
            <span className="text-zinc-600">{state.replaceAll("_", " ")}</span>
            <button disabled={demo} className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
              Advance state
            </button>
          </div>
        ))}
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
          ["Inventory", "Reservations, movements, returns and low-stock alerts.", ["AET-ARC-STD: 12 available", "AET-PULSE-STD: low stock", "Expired reservations: 0"]],
          ["Users", "Commerce profiles synced from Clerk without storing credentials.", ["customer@example.com", "admin@example.com", "Local status: active"]],
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
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Shipping, countries, reservation TTL, SEO and portfolio link.
          </p>
          <div className="mt-4 grid gap-2">
            <div className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-600">
              Free shipping threshold: USD 150
            </div>
            <div className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-600">
              Reservation TTL: 15 minutes
            </div>
          </div>

          <div className="mt-4 border-t border-zinc-200 pt-4">
            <h3 className="text-sm font-semibold">Branding</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Store name, logo and accent color used across the storefront.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-zinc-700">Store name</span>
                <input
                  disabled={demo}
                  value={brandForm.name}
                  onChange={(event) => setBrandForm((current) => ({ ...current, name: event.target.value }))}
                  className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-zinc-700">Accent color</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    disabled={demo}
                    value={brandForm.primaryColor}
                    onChange={(event) =>
                      setBrandForm((current) => ({ ...current, primaryColor: event.target.value }))
                    }
                    className="h-10 w-12 rounded-md border border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    disabled={demo}
                    value={brandForm.primaryColor}
                    onChange={(event) =>
                      setBrandForm((current) => ({ ...current, primaryColor: event.target.value }))
                    }
                    placeholder="#8b5cf6"
                    className="focus-ring min-h-10 flex-1 rounded-md border border-zinc-300 px-3 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="font-medium text-zinc-700">Logo URL</span>
                <input
                  disabled={demo}
                  value={brandForm.logoUrl}
                  onChange={(event) => setBrandForm((current) => ({ ...current, logoUrl: event.target.value }))}
                  placeholder="https://.../logo.png"
                  className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="text-xs text-zinc-500">Leave empty to keep the default Aether mark.</span>
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  disabled={demo}
                  checked={brandForm.features.reviews}
                  onChange={(event) =>
                    setBrandForm((current) => ({
                      ...current,
                      features: { ...current.features, reviews: event.target.checked }
                    }))
                  }
                  className="h-4 w-4 rounded border-zinc-300 disabled:cursor-not-allowed"
                />
                <span className="font-medium text-zinc-700">Show product reviews</span>
              </label>
              <div className="flex items-center gap-3 sm:col-span-2">
                <button
                  type="button"
                  disabled={demo || brandSaveStatus === "saving"}
                  onClick={() => void saveBrandSettings()}
                  className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {brandSaveStatus === "saving" ? "Saving..." : "Save"}
                </button>
                {brandSaveStatus === "saved" ? (
                  <span className="text-sm text-teal-700">Saved.</span>
                ) : brandSaveStatus === "error" ? (
                  <span className="text-sm text-rose-700">
                    Could not save - check the color format and your permissions.
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-zinc-200 pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <MessageCircle size={15} aria-hidden />
              Checkout method
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Stripe runs the normal sandbox checkout. WhatsApp sends shoppers to a chat with the sales
              number instead - no payment gateway required.
            </p>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-zinc-700">Payment method</span>
                <select
                  disabled={demo}
                  value={checkoutForm.paymentMode}
                  onChange={(event) =>
                    setCheckoutForm((current) => ({
                      ...current,
                      paymentMode: event.target.value as "stripe" | "whatsapp"
                    }))
                  }
                  className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="stripe">Stripe</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </label>
              {checkoutForm.paymentMode === "whatsapp" ? (
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-zinc-700">Sales WhatsApp number</span>
                  <input
                    disabled={demo}
                    value={checkoutForm.whatsappNumber}
                    onChange={(event) =>
                      setCheckoutForm((current) => ({ ...current, whatsappNumber: event.target.value }))
                    }
                    placeholder="573001234567"
                    className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span className="text-xs text-zinc-500">
                    Country code + number, digits only - no +, spaces or dashes.
                  </span>
                </label>
              ) : null}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={demo || checkoutSaveStatus === "saving"}
                  onClick={() => void saveCheckoutSettings()}
                  className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {checkoutSaveStatus === "saving" ? "Saving..." : "Save"}
                </button>
                {checkoutSaveStatus === "saved" ? (
                  <span className="text-sm text-teal-700">Saved.</span>
                ) : checkoutSaveStatus === "error" ? (
                  <span className="text-sm text-rose-700">
                    Could not save - check the number format and your permissions.
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
