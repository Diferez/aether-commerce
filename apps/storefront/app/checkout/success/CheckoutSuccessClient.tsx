"use client";

import { useEffect, useMemo, useState } from "react";
import { apiBaseUrl } from "../../../components/config";
import { useAetherAuth } from "../../../components/ClerkAuthProvider";

type ConfirmState = "idle" | "confirming" | "created" | "existing" | "missing-session" | "error";

export function CheckoutSuccessClient() {
  const { getToken, isLoaded, isSignedIn } = useAetherAuth();
  const [state, setState] = useState<ConfirmState>("idle");
  const [orderNumber, setOrderNumber] = useState<string>("");

  // Stripe returns session_id (from the {CHECKOUT_SESSION_ID} template in the
  // success_url); Wompi's checkout redirect appends the transaction id as
  // `id` (or `transaction_id` on some integrations) instead. /checkout/confirm
  // only needs *a* provider-specific session identifier - it resolves which
  // provider is active server-side, so this page never needs to know which
  // one ran.
  const sessionId = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    const params = new URLSearchParams(window.location.search);
    return params.get("session_id") ?? params.get("id") ?? params.get("transaction_id") ?? "";
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!sessionId) {
      setState("missing-session");
      return;
    }
    if (!isSignedIn) {
      setState("error");
      return;
    }

    let active = true;
    setState("confirming");
    getToken()
      .then((token) =>
        fetch(`${apiBaseUrl}/api/v1/checkout/confirm`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ sessionId })
        })
      )
      .then((response) => response.json() as Promise<{ success?: boolean; data?: { created?: boolean; order?: { number?: string } } }>)
      .then((payload) => {
        if (!active) {
          return;
        }
        if (!payload.success) {
          setState("error");
          return;
        }
        setOrderNumber(payload.data?.order?.number ?? "");
        setState(payload.data?.created ? "created" : "existing");
      })
      .catch(() => {
        if (active) {
          setState("error");
        }
      });

    return () => {
      active = false;
    };
  }, [getToken, isLoaded, isSignedIn, sessionId]);

  const label =
    state === "confirming"
      ? "Confirming order"
      : state === "created"
        ? "Order created"
        : state === "existing"
          ? "Order already confirmed"
          : state === "missing-session"
            ? "Payment confirmed"
            : state === "error"
              ? "Payment confirmed, order pending"
              : "Payment confirmed";

  const body =
    state === "confirming"
      ? "We are saving your sandbox order in D1."
      : state === "created"
        ? `Your order${orderNumber ? ` ${orderNumber}` : ""} was saved successfully.`
        : state === "existing"
          ? `Your order${orderNumber ? ` ${orderNumber}` : ""} was already saved.`
          : state === "missing-session"
            ? "The payment provider returned without a session id. The webhook can still save the order if it is configured."
            : state === "error"
              ? "The payment provider approved the payment, but the order could not be confirmed from this page. Check webhook configuration or Worker logs."
              : "The webhook flow is idempotent and stores payment/order events in D1.";

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6">
      <p className="text-sm font-semibold uppercase text-cyan-300">{label}</p>
      <h1 className="mt-2 text-4xl font-semibold">Sandbox checkout completed</h1>
      <p className="mt-4 text-zinc-600">{body}</p>
    </section>
  );
}
