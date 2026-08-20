"use client";

import { useEffect, useState } from "react";
import { useStorefrontConfig } from "./AetherStorefrontProvider";

export type CheckoutOptions = { paymentMode: "stripe" | "whatsapp"; whatsappNumber: string };

// Shared by every component that needs to know whether WhatsApp checkout is
// on and what number to use (cart page, product detail, the WhatsApp
// bubble) - each used to fetch this independently with its own copy of the
// same effect.
export function useCheckoutOptions(): CheckoutOptions | null {
  const { apiBaseUrl } = useStorefrontConfig();
  const [checkoutOptions, setCheckoutOptions] = useState<CheckoutOptions | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${apiBaseUrl}/api/v1/checkout/options`)
      .then((response) => response.json())
      .then((payload: { success: boolean; data?: CheckoutOptions }) => {
        if (!cancelled && payload.success && payload.data) setCheckoutOptions(payload.data);
      })
      .catch(() => {
        // Stripe stays the safe default if this read fails - never silently
        // switch a shopper into a mode with no working checkout.
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  return checkoutOptions;
}

export type ShippingSettings = { enabled: boolean; amountCents: number };

// Whether the flat shipping fee is on, and how much it is - drives both the
// cart page's decision to detour through /checkout (see CartPage.tsx's
// checkout()) and that page's own summary/gate. The fee itself is already
// reflected in cart.totals.shipping by the time this loads (the API adds it
// server-side on every cart mutation (see services/cart.ts's
// getShippingCents) - this is only read to know whether to ask for an address
// and to render the "Shipping" line's source, not to compute anything.
export function useShippingSettings(): ShippingSettings | null {
  const { apiBaseUrl } = useStorefrontConfig();
  const [shippingSettings, setShippingSettings] = useState<ShippingSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${apiBaseUrl}/api/v1/shipping/settings`)
      .then((response) => response.json())
      .then((payload: { success: boolean; data?: ShippingSettings }) => {
        if (!cancelled && payload.success && payload.data) setShippingSettings(payload.data);
      })
      .catch(() => {
        // Disabled stays the safe default if this read fails - never send a
        // shopper through the address step for a fee that can't be confirmed.
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  return shippingSettings;
}
