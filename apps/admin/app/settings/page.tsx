"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { ImagePlus, Loader2, MessageCircle, Timer, Truck, X } from "lucide-react";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";
import { PageHeader } from "../../components/PageHeader";
import { FormSection } from "../../components/FormSection";
import { ErrorState } from "../../components/ErrorState";
import { useAdminLanguage } from "../../components/AdminLanguageProvider";
import { WhatsappNumberInput } from "../../components/WhatsappNumberInput";

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

function money(cents: number, locale: string) {
  return new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function SettingsPage() {
  const { getToken } = useAuth();
  const { t, locale } = useAdminLanguage();
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [brandForm, setBrandForm] = useState<BrandSettings>(defaultBrand);
  const [brandSaveStatus, setBrandSaveStatus] = useState<SaveStatus>("idle");
  const [checkoutForm, setCheckoutForm] = useState<CheckoutSettings>(defaultCheckout);
  const [checkoutSaveStatus, setCheckoutSaveStatus] = useState<SaveStatus>("idle");
  const [shippingForm, setShippingForm] = useState<ShippingSettings>(defaultShipping);
  const [shippingSaveStatus, setShippingSaveStatus] = useState<SaveStatus>("idle");
  const [reservationsForm, setReservationsForm] = useState<ReservationSettings>(defaultReservations);
  const [reservationsSaveStatus, setReservationsSaveStatus] = useState<SaveStatus>("idle");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  const authHeader = useCallback(async () => {
    const token = await getToken().catch(() => null);
    return token ? { authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  // Same signed-upload flow as ProductForm's image upload (POST /uploads/signature
  // for a Cloudinary signature, then upload straight to Cloudinary from the
  // browser - the API secret never leaves the server). Only sets local form
  // state here; the logo isn't persisted until the Branding section's own
  // Save button is clicked, same as every other field in this form.
  async function handleLogoFileSelected(file: File) {
    setLogoUploading(true);
    setLogoUploadError(null);
    try {
      const sigResponse = await fetch(`${apiBaseUrl}/api/v1/admin/uploads/signature`, {
        method: "POST",
        headers: await authHeader()
      });
      const sigPayload = (await sigResponse.json()) as {
        success: boolean;
        data?: { cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string };
        error?: { message: string };
      };
      if (!sigPayload.success || !sigPayload.data) {
        setLogoUploadError(sigPayload.error?.message ?? t.settingsPage.imageUploadsNotConfigured);
        return;
      }
      const { cloudName, apiKey, timestamp, folder, signature } = sigPayload.data;
      const form = new FormData();
      form.set("file", file);
      form.set("api_key", apiKey);
      form.set("timestamp", String(timestamp));
      form.set("folder", folder);
      form.set("signature", signature);
      const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: form
      });
      const uploadPayload = (await uploadResponse.json()) as { secure_url?: string; error?: { message?: string } };
      if (!uploadResponse.ok || !uploadPayload.secure_url) {
        setLogoUploadError(uploadPayload.error?.message ?? t.settingsPage.imageUploadFailed);
        return;
      }
      setBrandForm((current) => ({ ...current, logoUrl: uploadPayload.secure_url as string }));
    } catch {
      setLogoUploadError(t.settingsPage.networkErrorLogoNotUploaded);
    } finally {
      setLogoUploading(false);
    }
  }

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
    if (status === "saved") return <span className="text-sm text-success">{t.settingsPage.saved}</span>;
    if (status === "error") return <span className="text-sm text-danger">{errorMessage}</span>;
    return null;
  }

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader title={t.settingsPage.title} description={t.settingsPage.description} />

        {loadStatus === "error" ? (
          <ErrorState title={t.settingsPage.couldNotLoadSettings} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <FormSection title={t.settingsPage.brandingSection} description={t.settingsPage.brandingDescription}>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">{t.settingsPage.storeName}</span>
                <input
                  value={brandForm.name}
                  onChange={(event) => setBrandForm((current) => ({ ...current, name: event.target.value }))}
                  className="focus-ring min-h-10 rounded-md border border-border bg-surface px-3 text-ink"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">{t.settingsPage.accentColor}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t.settingsPage.accentColorPicker}
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
              <div className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">{t.settingsPage.logo}</span>
                <div className="flex items-center gap-3">
                  {brandForm.logoUrl ? (
                    <div className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-surface-hover">
                      {/* Plain <img>, not next/image - arbitrary Cloudinary URL */}
                      <img src={brandForm.logoUrl} alt="" className="h-full w-full object-contain" />
                      <button
                        type="button"
                        onClick={() => setBrandForm((current) => ({ ...current, logoUrl: "" }))}
                        aria-label={t.settingsPage.removeLogo}
                        className="focus-ring absolute right-0.5 top-0.5 rounded bg-ink/70 p-0.5 text-surface opacity-0 group-hover:opacity-100"
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong text-ink-subtle">
                      <ImagePlus size={18} aria-hidden />
                    </span>
                  )}
                  <div className="grid gap-1">
                    <button
                      type="button"
                      disabled={logoUploading}
                      onClick={() => logoFileInputRef.current?.click()}
                      className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-2.5 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {logoUploading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ImagePlus size={14} aria-hidden />}
                      {logoUploading ? t.settingsPage.uploading : brandForm.logoUrl ? t.settingsPage.replaceLogo : t.settingsPage.uploadLogo}
                    </button>
                    {logoUploadError ? <p className="text-xs text-danger">{logoUploadError}</p> : null}
                  </div>
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleLogoFileSelected(file);
                      event.target.value = "";
                    }}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={brandForm.features.reviews}
                  onChange={(event) => setBrandForm((current) => ({ ...current, features: { ...current.features, reviews: event.target.checked } }))}
                  className="h-4 w-4 rounded border-border-strong"
                />
                <span className="font-medium text-ink-muted">{t.settingsPage.showProductReviews}</span>
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={brandSaveStatus === "saving"}
                  onClick={() => void saveSettings("brand", brandForm, setBrandSaveStatus)}
                  className="focus-ring min-h-10 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {brandSaveStatus === "saving" ? t.settingsPage.saving : t.settingsPage.save}
                </button>
                {saveNote(brandSaveStatus, t.settingsPage.brandSaveError)}
              </div>
            </FormSection>

            <FormSection
              title={
                <>
                  <MessageCircle size={16} aria-hidden />
                  {t.settingsPage.checkoutMethodSection}
                </>
              }
              description={t.settingsPage.checkoutMethodDescription}
            >
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">{t.settingsPage.paymentMethod}</span>
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
                  <span className="font-medium text-ink-muted">{t.settingsPage.salesWhatsappNumber}</span>
                  <WhatsappNumberInput
                    value={checkoutForm.whatsappNumber}
                    onChange={(nextValue) => setCheckoutForm((current) => ({ ...current, whatsappNumber: nextValue }))}
                  />
                  <span className="text-xs text-ink-subtle">{t.settingsPage.whatsappNumberHint}</span>
                </label>
              ) : null}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={checkoutSaveStatus === "saving"}
                  onClick={() => void saveSettings("checkout", checkoutForm, setCheckoutSaveStatus)}
                  className="focus-ring min-h-10 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {checkoutSaveStatus === "saving" ? t.settingsPage.saving : t.settingsPage.save}
                </button>
                {saveNote(checkoutSaveStatus, t.settingsPage.checkoutSaveError)}
              </div>
            </FormSection>

            <FormSection
              title={
                <>
                  <Truck size={16} aria-hidden />
                  {t.settingsPage.shippingSection}
                </>
              }
              description={t.settingsPage.shippingDescription}
            >
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">{t.settingsPage.freeShippingThreshold}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    aria-label={t.settingsPage.freeShippingThresholdLabel}
                    value={shippingForm.freeShippingThreshold / 100}
                    onChange={(event) =>
                      setShippingForm((current) => ({
                        ...current,
                        freeShippingThreshold: Math.max(0, Math.round(Number(event.target.value) * 100))
                      }))
                    }
                    className="focus-ring min-h-10 w-32 rounded-md border border-border bg-surface px-3 text-ink tabular-nums"
                  />
                  <span className="text-sm text-ink-muted tabular-nums">= {money(shippingForm.freeShippingThreshold, locale)}</span>
                </div>
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={shippingSaveStatus === "saving"}
                  onClick={() => void saveSettings("shipping", shippingForm, setShippingSaveStatus)}
                  className="focus-ring min-h-10 rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {shippingSaveStatus === "saving" ? t.settingsPage.saving : t.settingsPage.save}
                </button>
                {saveNote(shippingSaveStatus, t.settingsPage.genericSaveError)}
              </div>
            </FormSection>

            <FormSection
              title={
                <>
                  <Timer size={16} aria-hidden />
                  {t.settingsPage.cartReservationsSection}
                </>
              }
              description={t.settingsPage.cartReservationsDescription}
            >
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">{t.settingsPage.reservationTtlLabel}</span>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  aria-label={t.settingsPage.reservationTtlAriaLabel}
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
                  {reservationsSaveStatus === "saving" ? t.settingsPage.saving : t.settingsPage.save}
                </button>
                {saveNote(reservationsSaveStatus, t.settingsPage.genericSaveError)}
              </div>
            </FormSection>
          </div>
        )}
      </main>
    </RequireAdminAuth>
  );
}
