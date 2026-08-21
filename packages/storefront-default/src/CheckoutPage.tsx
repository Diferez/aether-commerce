"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";
import { formatMoney } from "@aether-commerce/core";
import type { Address, Cart } from "@aether-commerce/schemas";
import { Button } from "@aether-commerce/ui";
import { useStorefrontConfig, useStorefrontPath } from "./AetherStorefrontProvider";
import { createCartClient } from "./cart-client";
import { useCheckoutOptions, useShippingSettings } from "./checkout-options";
import { useAetherAuth } from "./AetherAuthProvider";
import { useCustomerSession } from "./customer-client";
import { useLanguage } from "./LanguageProvider";
import { StorefrontLink } from "./StorefrontLink";

type FormState = {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
};

const emptyForm: FormState = { fullName: "", phone: "", line1: "", line2: "", city: "", region: "", postalCode: "" };

function addressToForm(address: Address): FormState {
  return {
    fullName: address.fullName,
    phone: address.phone ?? "",
    line1: address.line1,
    line2: address.line2 ?? "",
    city: address.city,
    region: address.region,
    postalCode: address.postalCode
  };
}

function fieldClass() {
  return "focus-ring min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-zinc-950";
}

export function CheckoutPage() {
  const { locale, t } = useLanguage();
  const router = useRouter();
  const { config, apiBaseUrl } = useStorefrontConfig();
  const storefrontPath = useStorefrontPath();
  const { createCheckoutSession, getCartCredentials, readLocalCart, readLocalCartItems, syncLocalCartToApi } = useMemo(
    () => createCartClient(apiBaseUrl),
    [apiBaseUrl]
  );
  const { customer } = useCustomerSession();
  const { getToken } = useAetherAuth();
  const checkoutOptions = useCheckoutOptions();
  const shippingSettings = useShippingSettings();
  const [cart, setCart] = useState<Cart | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [saveAddress, setSaveAddress] = useState(true);

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/addresses`, {
          headers: token ? { authorization: `Bearer ${token}` } : {}
        });
        const payload = (await response.json()) as { success: boolean; data?: Address[] };
        if (cancelled || !payload.success || !payload.data) return;
        setSavedAddresses(payload.data);
        // Pre-select the shopper's first saved address so returning
        // customers see their details already filled in, without having to
        // click anything - they can still switch to "use a new address".
        const first = payload.data[0];
        if (first?.id) {
          setSelectedAddressId(first.id);
          setForm(addressToForm(first));
        }
      } catch {
        // Saved addresses are a convenience, not a requirement - the plain
        // form below still works if this fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customer, getToken, apiBaseUrl]);

  function selectSavedAddress(address: Address) {
    setSelectedAddressId(address.id ?? null);
    setForm(addressToForm(address));
  }

  function useNewAddress() {
    setSelectedAddressId(null);
    setForm(emptyForm);
  }

  useEffect(() => {
    void (async () => {
      const { cartId, token } = await getCartCredentials();
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/cart/${cartId}`, { headers: token ? { "x-aether-cart-token": token } : {} });
        const payload = (await response.json()) as { success: boolean; data?: Cart };
        setCart(payload.success && payload.data?.items.length ? payload.data : readLocalCart(cartId));
      } catch {
        setCart(readLocalCart(cartId));
      }
    })();
  }, [apiBaseUrl]);

  // Redirects out of this page for every case where it shouldn't be shown:
  // no items, shipping not charged (once the setting has actually loaded -
  // shippingSettings starts null while that request is in flight, so this
  // only fires once we know for sure), or WhatsApp checkout (shipping is
  // coordinated directly over chat there instead - see CartPage.tsx's
  // checkout(), which never routes here in that mode).
  useEffect(() => {
    if (checkoutOptions?.paymentMode === "whatsapp") {
      router.push(storefrontPath("/cart"));
      return;
    }
    if (shippingSettings && !shippingSettings.enabled) {
      router.push(storefrontPath("/cart"));
      return;
    }
    if (cart && cart.items.length === 0) {
      router.push(storefrontPath("/cart"));
      return;
    }
    if (!customer) {
      router.push(storefrontPath("/register?next=/checkout&checkout=1"));
    }
    // storefrontPath is intentionally omitted - useStorefrontPath() returns a
    // new function identity every render (see LoginPage/RegisterPage for the
    // same established pattern), and it's not what should trigger a re-run.
  }, [checkoutOptions, shippingSettings, cart, customer, router]);

  function updateField<K extends keyof FormState>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.fullName.trim() || !form.phone.trim() || !form.line1.trim() || !form.city.trim() || !form.region.trim()) {
      setStatus(t.checkoutAddressRequired);
      return;
    }

    const shippingAddress: Address = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      line1: form.line1.trim(),
      ...(form.line2.trim() ? { line2: form.line2.trim() } : {}),
      city: form.city.trim(),
      region: form.region.trim(),
      postalCode: form.postalCode.trim() || "000000",
      country: config.store.country
    };

    setSubmitting(true);
    setStatus(t.preparingCheckout);

    // Best-effort: saving the address for next time must never block or
    // fail checkout itself - only attempted for a freshly-typed address
    // (selectedAddressId is null), never re-saved when the shopper picked
    // one already on file.
    if (saveAddress && !selectedAddressId && customer) {
      void (async () => {
        const token = await getToken();
        try {
          await fetch(`${apiBaseUrl}/api/v1/addresses`, {
            method: "POST",
            headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(shippingAddress)
          });
        } catch {
          // Non-fatal - the order still goes through with this address either way.
        }
      })();
    }

    try {
      let payload = await createCheckoutSession(getToken, shippingAddress);

      if (!payload.success && payload.error?.code === "EMPTY_CART" && readLocalCartItems().length > 0) {
        setStatus(t.syncingCartCheckout);
        await syncLocalCartToApi();
        payload = await createCheckoutSession(getToken, shippingAddress);
      }

      if (payload.success && payload.data?.checkoutUrl) {
        window.location.href = payload.data.checkoutUrl;
        return;
      }

      setStatus(payload.error?.message ?? t.checkoutFailed);
    } catch {
      setStatus(t.startApiCheckout);
    } finally {
      setSubmitting(false);
    }
  }

  const money = (cents: number) => formatMoney(cents, cart?.totals.currency ?? config.store.currency, locale === "es" ? "es-CO" : "en-US");

  return (
    <main className="aether-shell py-8">
      <p className="flex items-center gap-2 text-sm font-semibold uppercase text-accent">
        <Truck size={17} aria-hidden />
        {t.checkoutPageTitle}
      </p>
      <h1 className="mt-1 text-4xl font-semibold text-zinc-950">{t.checkoutPageTitle}</h1>
      <p className="mt-2 max-w-xl text-sm text-zinc-600">{t.checkoutPageDescription}</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={(event) => void submit(event)} className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-5">
          {savedAddresses.length > 0 ? (
            <div className="mb-1 grid gap-2">
              <span className="text-sm font-medium text-zinc-700">{t.savedAddresses}</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {savedAddresses.map((address) => (
                  <button
                    key={address.id}
                    type="button"
                    onClick={() => selectSavedAddress(address)}
                    aria-pressed={selectedAddressId === address.id}
                    className={`focus-ring rounded-md border px-3 py-2 text-left text-sm ${
                      selectedAddressId === address.id ? "border-accent bg-accent-soft" : "border-zinc-300 hover:bg-zinc-50"
                    }`}
                  >
                    <p className="font-semibold text-zinc-950">{address.fullName}</p>
                    <p className="text-zinc-600">
                      {address.line1}, {address.city}, {address.region}
                    </p>
                  </button>
                ))}
              </div>
              {selectedAddressId ? (
                <button
                  type="button"
                  onClick={useNewAddress}
                  className="focus-ring justify-self-start text-sm font-semibold text-accent underline decoration-accent underline-offset-4"
                >
                  {t.useNewAddress}
                </button>
              ) : null}
            </div>
          ) : null}
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">{t.shippingFullName}</span>
            <input required value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} className={fieldClass()} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">{t.shippingPhone}</span>
            <input required type="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} className={fieldClass()} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">{t.shippingAddressLine1}</span>
            <input required value={form.line1} onChange={(event) => updateField("line1", event.target.value)} className={fieldClass()} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">{t.shippingAddressLine2}</span>
            <input value={form.line2} onChange={(event) => updateField("line2", event.target.value)} className={fieldClass()} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-zinc-700">{t.shippingCity}</span>
              <input required value={form.city} onChange={(event) => updateField("city", event.target.value)} className={fieldClass()} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-zinc-700">{t.shippingRegion}</span>
              <input required value={form.region} onChange={(event) => updateField("region", event.target.value)} className={fieldClass()} />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700">{t.shippingPostalCode}</span>
            <input value={form.postalCode} onChange={(event) => updateField("postalCode", event.target.value)} className={fieldClass()} />
          </label>

          {customer && !selectedAddressId ? (
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
              {t.saveAddressForNextTime}
            </label>
          ) : null}

          {status ? <p className="text-sm text-zinc-600">{status}</p> : null}

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? t.preparingCheckout : t.continueToPayment}
            </Button>
            <StorefrontLink href="/cart" className="focus-ring text-sm font-semibold text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950">
              {t.backToCart}
            </StorefrontLink>
          </div>
        </form>

        <aside className="h-fit rounded-lg border border-zinc-200 bg-white p-5 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold text-zinc-950">{t.summary}</h2>
          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex justify-between"><dt>{t.subtotal}</dt><dd>{money(cart?.totals.subtotal ?? 0)}</dd></div>
            <div className="flex justify-between"><dt>{t.discount}</dt><dd>-{money(cart?.totals.discount ?? 0)}</dd></div>
            <div className="flex justify-between"><dt>{t.shipping}</dt><dd>{money(cart?.totals.shipping ?? 0)}</dd></div>
            <div className="flex justify-between border-t border-zinc-200 pt-3 text-base font-semibold"><dt>{t.total}</dt><dd>{money(cart?.totals.total ?? 0)}</dd></div>
          </dl>
        </aside>
      </div>
    </main>
  );
}
