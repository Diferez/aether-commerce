"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { MessageCircle, Timer, Truck } from "lucide-react";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";
import { PageHeader } from "../../components/PageHeader";
import { FormSection } from "../../components/FormSection";
import { ErrorState } from "../../components/ErrorState";

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
    if (status === "saved") return <span className="text-sm text-success">Saved.</span>;
    if (status === "error") return <span className="text-sm text-danger">{errorMessage}</span>;
    return null;
  }

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader title="Settings" description="Branding, checkout method, shipping, and cart reservation hold time." />

        {loadStatus === "error" ? (
          <ErrorState title="Could not load current settings" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <FormSection title="Branding" description="Store name, logo and accent color used across the storefront.">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">Store name</span>
                <input
                  value={brandForm.name}
                  onChange={(event) => setBrandForm((current) => ({ ...current, name: event.target.value }))}
                  className="focus-ring min-h-10 rounded-md border border-border bg-surface px-3 text-ink"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">Accent color</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Accent color picker"
                    value={brandForm.primaryColor}
                    onChange={(event) => setBrandForm((current) => ({ ...current, primaryColor: event.target.value }))}
                    className="h-10 w-12 rounded-md border border-border"
                  />
                  <input
                    value={brandForm.primaryColor}
                    onChange={(event) => setBrandForm((current) => ({ ...current, primaryColor: event.target.value }))}
                    placeholder="#8b5cf6"
                    className="focus-ring min-h-10 flex-1 rounded-md border border-border bg-surface px-3 text-ink"
                  />
                </div>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">Logo URL</span>
                <input
                  value={brandForm.logoUrl}
                  onChange={(event) => setBrandForm((current) => ({ ...current, logoUrl: event.target.value }))}
                  placeholder="https://.../logo.png"
                  className="focus-ring min-h-10 rounded-md border border-border bg-surface px-3 text-ink"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={brandForm.features.reviews}
                  onChange={(event) => setBrandForm((current) => ({ ...current, features: { ...current.features, reviews: event.target.checked } }))}
                  className="h-4 w-4 rounded border-border-strong"
                />
                <span className="font-medium text-ink-muted">Show product reviews</span>
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={brandSaveStatus === "saving"}
                  onClick={() => void saveSettings("brand", brandForm, setBrandSaveStatus)}
                  className="focus-ring min-h-10 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {brandSaveStatus === "saving" ? "Saving..." : "Save"}
                </button>
                {saveNote(brandSaveStatus, "Could not save - check the color format and your permissions.")}
              </div>
            </FormSection>

            <FormSection
              title={
                <>
                  <MessageCircle size={16} aria-hidden />
                  Checkout method
                </>
              }
              description="Stripe runs the normal sandbox checkout. WhatsApp sends shoppers to a chat with the sales number instead."
            >
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">Payment method</span>
                <select
                  value={checkoutForm.paymentMode}
                  onChange={(event) => setCheckoutForm((current) => ({ ...current, paymentMode: event.target.value as "stripe" | "whatsapp" }))}
                  className="focus-ring min-h-10 rounded-md border border-border bg-surface px-3 text-ink"
                >
                  <option value="stripe">Stripe</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </label>
              {checkoutForm.paymentMode === "whatsapp" ? (
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-ink-muted">Sales WhatsApp number</span>
                  <input
                    value={checkoutForm.whatsappNumber}
                    onChange={(event) => setCheckoutForm((current) => ({ ...current, whatsappNumber: event.target.value }))}
                    placeholder="573001234567"
                    className="focus-ring min-h-10 rounded-md border border-border bg-surface px-3 text-ink"
                  />
                  <span className="text-xs text-ink-subtle">Country code + number, digits only - no +, spaces or dashes.</span>
                </label>
              ) : null}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={checkoutSaveStatus === "saving"}
                  onClick={() => void saveSettings("checkout", checkoutForm, setCheckoutSaveStatus)}
                  className="focus-ring min-h-10 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {checkoutSaveStatus === "saving" ? "Saving..." : "Save"}
                </button>
                {saveNote(checkoutSaveStatus, "Could not save - check the number format and your permissions.")}
              </div>
            </FormSection>

            <FormSection
              title={
                <>
                  <Truck size={16} aria-hidden />
                  Shipping
                </>
              }
              description="Orders at or above this subtotal get free standard shipping on the storefront."
            >
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">Free shipping threshold</span>
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
                    className="focus-ring min-h-10 w-32 rounded-md border border-border bg-surface px-3 text-ink tabular-nums"
                  />
                  <span className="text-sm text-ink-muted tabular-nums">= {money(shippingForm.freeShippingThreshold)}</span>
                </div>
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={shippingSaveStatus === "saving"}
                  onClick={() => void saveSettings("shipping", shippingForm, setShippingSaveStatus)}
                  className="focus-ring min-h-10 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {shippingSaveStatus === "saving" ? "Saving..." : "Save"}
                </button>
                {saveNote(shippingSaveStatus, "Could not save - check your permissions.")}
              </div>
            </FormSection>

            <FormSection
              title={
                <>
                  <Timer size={16} aria-hidden />
                  Cart reservations
                </>
              }
              description="How long an item stays held for a shopper after being added to their cart, before it's released back to available stock."
            >
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">Reservation TTL (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  aria-label="Reservation TTL in minutes"
                  value={reservationsForm.ttlMinutes}
                  onChange={(event) => setReservationsForm({ ttlMinutes: Math.max(1, Math.round(Number(event.target.value))) })}
                  className="focus-ring min-h-10 w-24 rounded-md border border-border bg-surface px-3 text-ink tabular-nums"
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={reservationsSaveStatus === "saving"}
                  onClick={() => void saveSettings("reservations", reservationsForm, setReservationsSaveStatus)}
                  className="focus-ring min-h-10 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {reservationsSaveStatus === "saving" ? "Saving..." : "Save"}
                </button>
                {saveNote(reservationsSaveStatus, "Could not save - check your permissions.")}
              </div>
            </FormSection>
          </div>
        )}
      </main>
    </RequireAdminAuth>
  );
}
