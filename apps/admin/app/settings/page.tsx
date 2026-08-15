"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { ArrowLeft, MessageCircle, Timer, Truck } from "lucide-react";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";

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

type ShippingSettings = {
  freeShippingThreshold: number;
  countries: string[];
  options: Array<{ id: string; label: string; amount: number; currency: string; estimatedDays: string }>;
};

type ReservationSettings = {
  ttlMinutes: number;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const defaultBrand: BrandSettings = {
  name: "Aether",
  tagline: { en: "Technology, elevated.", es: "Tecnologia a otro nivel." },
  logoUrl: "",
  primaryColor: "#8b5cf6",
  portfolioUrl: "",
  features: { reviews: true }
};

const defaultCheckout: CheckoutSettings = { paymentMode: "stripe", whatsappNumber: "", whatsappMessageTemplate: "" };
const defaultShipping: ShippingSettings = { freeShippingThreshold: 15000, countries: ["US"], options: [] };
const defaultReservations: ReservationSettings = { ttlMinutes: 15 };

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function SettingsPage() {
  const { getToken } = useAuth();
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [brandForm, setBrandForm] = useState<BrandSettings>(defaultBrand);
  const [brandSaveStatus, setBrandSaveStatus] = useState<SaveStatus>("idle");
  const [checkoutForm, setCheckoutForm] = useState<CheckoutSettings>(defaultCheckout);
  const [checkoutSaveStatus, setCheckoutSaveStatus] = useState<SaveStatus>("idle");
  const [shippingForm, setShippingForm] = useState<ShippingSettings>(defaultShipping);
  const [shippingSaveStatus, setShippingSaveStatus] = useState<SaveStatus>("idle");
  const [reservationsForm, setReservationsForm] = useState<ReservationSettings>(defaultReservations);
  const [reservationsSaveStatus, setReservationsSaveStatus] = useState<SaveStatus>("idle");

  const authHeader = useCallback(async () => {
    const token = await getToken().catch(() => null);
    return token ? { authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/admin/settings`, { headers: await authHeader() });
        const payload = (await response.json()) as {
          success: boolean;
          data?: Array<{ key: string; value_json: string }>;
        };
        if (!payload.success || !payload.data) {
          setLoadStatus("error");
          return;
        }
        for (const row of payload.data) {
          if (row.key === "brand") setBrandForm(JSON.parse(row.value_json) as BrandSettings);
          if (row.key === "checkout") setCheckoutForm(JSON.parse(row.value_json) as CheckoutSettings);
          if (row.key === "shipping") setShippingForm(JSON.parse(row.value_json) as ShippingSettings);
          if (row.key === "reservations") setReservationsForm(JSON.parse(row.value_json) as ReservationSettings);
        }
        setLoadStatus("ready");
      } catch {
        setLoadStatus("error");
      }
    })();
  }, [authHeader]);

  async function saveSettings<T>(key: string, value: T, setStatus: (status: SaveStatus) => void) {
    setStatus("saving");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/settings/${key}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(value)
      });
      const payload = (await response.json()) as { success: boolean };
      setStatus(payload.success ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  function saveNote(status: SaveStatus, errorMessage: string) {
    if (status === "saved") return <span className="text-sm text-teal-700">Saved.</span>;
    if (status === "error") return <span className="text-sm text-rose-700">{errorMessage}</span>;
    return null;
  }

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <a href="/" className="focus-ring mb-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950">
          <ArrowLeft size={15} aria-hidden />
          Dashboard
        </a>

        <h1 className="text-2xl font-semibold text-zinc-950">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Branding, checkout method, shipping, and cart reservation hold time.
        </p>

        {loadStatus === "error" ? (
          <div className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            Could not load current settings. Try again in a moment.
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Branding</h2>
              <p className="mt-1 text-sm text-zinc-500">Store name, logo and accent color used across the storefront.</p>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-zinc-700">Store name</span>
                  <input
                    value={brandForm.name}
                    onChange={(event) => setBrandForm((current) => ({ ...current, name: event.target.value }))}
                    className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-zinc-700">Accent color</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Accent color picker"
                      value={brandForm.primaryColor}
                      onChange={(event) => setBrandForm((current) => ({ ...current, primaryColor: event.target.value }))}
                      className="h-10 w-12 rounded-md border border-zinc-300"
                    />
                    <input
                      value={brandForm.primaryColor}
                      onChange={(event) => setBrandForm((current) => ({ ...current, primaryColor: event.target.value }))}
                      placeholder="#8b5cf6"
                      className="focus-ring min-h-10 flex-1 rounded-md border border-zinc-300 px-3"
                    />
                  </div>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-zinc-700">Logo URL</span>
                  <input
                    value={brandForm.logoUrl}
                    onChange={(event) => setBrandForm((current) => ({ ...current, logoUrl: event.target.value }))}
                    placeholder="https://.../logo.png"
                    className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={brandForm.features.reviews}
                    onChange={(event) =>
                      setBrandForm((current) => ({ ...current, features: { ...current.features, reviews: event.target.checked } }))
                    }
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  <span className="font-medium text-zinc-700">Show product reviews</span>
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={brandSaveStatus === "saving"}
                    onClick={() => void saveSettings("brand", brandForm, setBrandSaveStatus)}
                    className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {brandSaveStatus === "saving" ? "Saving..." : "Save"}
                  </button>
                  {saveNote(brandSaveStatus, "Could not save - check the color format and your permissions.")}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <MessageCircle size={17} aria-hidden />
                Checkout method
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Stripe runs the normal sandbox checkout. WhatsApp sends shoppers to a chat with the sales number instead.
              </p>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-zinc-700">Payment method</span>
                  <select
                    value={checkoutForm.paymentMode}
                    onChange={(event) =>
                      setCheckoutForm((current) => ({ ...current, paymentMode: event.target.value as "stripe" | "whatsapp" }))
                    }
                    className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3"
                  >
                    <option value="stripe">Stripe</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </label>
                {checkoutForm.paymentMode === "whatsapp" ? (
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-zinc-700">Sales WhatsApp number</span>
                    <input
                      value={checkoutForm.whatsappNumber}
                      onChange={(event) => setCheckoutForm((current) => ({ ...current, whatsappNumber: event.target.value }))}
                      placeholder="573001234567"
                      className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3"
                    />
                    <span className="text-xs text-zinc-500">Country code + number, digits only - no +, spaces or dashes.</span>
                  </label>
                ) : null}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={checkoutSaveStatus === "saving"}
                    onClick={() => void saveSettings("checkout", checkoutForm, setCheckoutSaveStatus)}
                    className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {checkoutSaveStatus === "saving" ? "Saving..." : "Save"}
                  </button>
                  {saveNote(checkoutSaveStatus, "Could not save - check the number format and your permissions.")}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Truck size={17} aria-hidden />
                Shipping
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Orders at or above this subtotal get free standard shipping on the storefront.
              </p>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-zinc-700">Free shipping threshold</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      aria-label="Free shipping threshold in dollars"
                      value={shippingForm.freeShippingThreshold / 100}
                      onChange={(event) =>
                        setShippingForm((current) => ({
                          ...current,
                          freeShippingThreshold: Math.max(0, Math.round(Number(event.target.value) * 100))
                        }))
                      }
                      className="focus-ring min-h-10 w-32 rounded-md border border-zinc-300 px-3"
                    />
                    <span className="text-sm text-zinc-500">= {money(shippingForm.freeShippingThreshold)}</span>
                  </div>
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={shippingSaveStatus === "saving"}
                    onClick={() => void saveSettings("shipping", shippingForm, setShippingSaveStatus)}
                    className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {shippingSaveStatus === "saving" ? "Saving..." : "Save"}
                  </button>
                  {saveNote(shippingSaveStatus, "Could not save - check your permissions.")}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Timer size={17} aria-hidden />
                Cart reservations
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                How long an item stays held for a shopper after being added to their cart, before it's released back
                to available stock.
              </p>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-zinc-700">Reservation TTL (minutes)</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    step={1}
                    aria-label="Reservation TTL in minutes"
                    value={reservationsForm.ttlMinutes}
                    onChange={(event) =>
                      setReservationsForm({ ttlMinutes: Math.max(1, Math.round(Number(event.target.value))) })
                    }
                    className="focus-ring min-h-10 w-24 rounded-md border border-zinc-300 px-3"
                  />
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={reservationsSaveStatus === "saving"}
                    onClick={() => void saveSettings("reservations", reservationsForm, setReservationsSaveStatus)}
                    className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {reservationsSaveStatus === "saving" ? "Saving..." : "Save"}
                  </button>
                  {saveNote(reservationsSaveStatus, "Could not save - check your permissions.")}
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </RequireAdminAuth>
  );
}
