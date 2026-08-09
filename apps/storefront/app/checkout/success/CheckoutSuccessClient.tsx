"use client";

import { useEffect, useMemo, useState } from "react";
import { apiBaseUrl } from "../../../components/config";

type ConfirmState = "idle" | "confirming" | "created" | "existing" | "missing-session" | "error";

export function CheckoutSuccessClient() {
  const [state, setState] = useState<ConfirmState>("idle");
  const [orderNumber, setOrderNumber] = useState<string>("");

  const sessionId = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return new URLSearchParams(window.location.search).get("session_id") ?? "";
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setState("missing-session");
      return;
    }

    let active = true;
    setState("confirming");
    fetch(`${apiBaseUrl}/api/v1/checkout/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId })
    })
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
  }, [sessionId]);

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
      ? "We are saving your Stripe sandbox order in D1."
      : state === "created"
        ? `Your order${orderNumber ? ` ${orderNumber}` : ""} was saved successfully.`
        : state === "existing"
          ? `Your order${orderNumber ? ` ${orderNumber}` : ""} was already saved.`
          : state === "missing-session"
            ? "Stripe returned without a session id. The webhook can still save the order if it is configured."
            : state === "error"
              ? "Stripe approved the payment, but the order could not be confirmed from this page. Check webhook configuration or Worker logs."
              : "The webhook flow is idempotent and stores payment/order events in D1.";

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6">
      <p className="text-sm font-semibold uppercase text-cyan-300">{label}</p>
      <h1 className="mt-2 text-4xl font-semibold">Sandbox checkout completed</h1>
      <p className="mt-4 text-zinc-600">{body}</p>
    </section>
  );
}
