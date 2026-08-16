"use client";

import { useEffect, useState } from "react";
import { apiBaseUrl } from "./config";

export type CheckoutOptions = { paymentMode: "stripe" | "whatsapp"; whatsappNumber: string };

// Shared by every component that needs to know whether WhatsApp checkout is
// on and what number to use (cart page, product detail, the WhatsApp
// bubble) - each used to fetch this independently with its own copy of the
// same effect.
export function useCheckoutOptions(): CheckoutOptions | null {
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
  }, []);

  return checkoutOptions;
}
