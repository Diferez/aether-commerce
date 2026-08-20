"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { PackageCheck, ShoppingBag } from "lucide-react";
import { canTransitionOrder, formatMoney } from "@aether/core";
import { createCommerceClient } from "@aether/api-client";
import type { Order, OrderState } from "@aether/schemas";
import { useStorefrontConfig } from "./AetherStorefrontProvider";
import { useAetherAuth } from "./AetherAuthProvider";
import { useCustomerSession } from "./customer-client";
import { useLanguage } from "./LanguageProvider";
import { StorefrontLink } from "./StorefrontLink";

type OrderStatus = "loading" | "ready" | "empty" | "signed-out" | "error";

export function OrdersPage() {
  const { locale, t } = useLanguage();
  const { apiBaseUrl } = useStorefrontConfig();
  const { customer, isLoaded } = useCustomerSession();
  const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useAetherAuth();
  const customerId = customer?.id ?? "";
  const customerEmail = customer?.email ?? "";
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<OrderStatus>("loading");

  useEffect(() => {
    if (!isLoaded || !isAuthLoaded) return;
    if (!customerId || !isSignedIn) {
      setOrders([]);
      setStatus("signed-out");
      return;
    }

    let active = true;
    setStatus("loading");
    const client = createCommerceClient({
      baseUrl: apiBaseUrl,
      getToken: async () => (await getToken()) ?? undefined
    });
    client
      .orders()
      .then((payload) => {
        if (!active) return;
        if (!payload.success) {
          setStatus("error");
          return;
        }
        const nextOrders = payload.data;
        setOrders(nextOrders);
        setStatus(nextOrders.length > 0 ? "ready" : "empty");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [isLoaded, isAuthLoaded, isSignedIn, customerId, customerEmail, getToken, apiBaseUrl]);

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function runOrderAction(orderId: string, action: "cancel" | "return" | "refund-request", targetState: OrderState) {
    setPendingAction(`${orderId}:${action}`);
    setActionError(null);
    try {
      const token = await getToken();
      const response = await fetch(`${apiBaseUrl}/api/v1/orders/${encodeURIComponent(orderId)}/${action}`, {
        method: "POST",
        headers: token ? { authorization: `Bearer ${token}` } : {}
      });
      const payload = (await response.json()) as { success: boolean };
      if (!payload.success) {
        setActionError(locale === "es" ? "No se pudo actualizar este pedido." : "This order could not be updated.");
        return;
      }
      setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, state: targetState } : order)));
    } catch {
      setActionError(locale === "es" ? "No se pudo actualizar este pedido." : "This order could not be updated.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="aether-shell py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase text-accent-2">
            <PackageCheck size={17} aria-hidden />
            {t.orders}
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-zinc-950">
            {locale === "es" ? "Historial de pedidos" : "Order history"}
          </h1>
          <p className="mt-2 text-zinc-600">
            {customer
              ? locale === "es"
                ? `Pedidos asociados a ${customer.email}.`
                : `Orders linked to ${customer.email}.`
              : locale === "es"
                ? "Ingresa para ver tus pedidos."
                : "Sign in to view your orders."}
          </p>
        </div>
        <StorefrontLink
          href="/products"
          className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white"
        >
          <ShoppingBag size={17} aria-hidden />
          {t.browseProducts}
        </StorefrontLink>
      </div>

      {status === "loading" ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <div className="h-5 w-40 animate-pulse rounded bg-zinc-200" />
          <div className="mt-4 h-20 animate-pulse rounded bg-zinc-100" />
        </section>
      ) : null}

      {status === "signed-out" ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <p className="text-zinc-600">{t.accountRequiredDescription}</p>
          <StorefrontLink
            href="/login"
            className="focus-ring mt-5 inline-flex min-h-11 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white"
          >
            {t.signIn}
          </StorefrontLink>
        </section>
      ) : null}

      {status === "empty" ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <p className="text-zinc-600">
            {locale === "es"
              ? "Todavia no hay pedidos guardados para esta cuenta. Completa un checkout de prueba usando el mismo correo."
              : "No orders are saved for this account yet. Complete a sandbox checkout using the same email."}
          </p>
        </section>
      ) : null}

      {status === "error" ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 p-6">
          <p className="font-semibold text-rose-900">
            {locale === "es" ? "No se pudieron cargar los pedidos." : "Orders could not be loaded."}
          </p>
          <p className="mt-2 text-sm text-rose-800">
            {locale === "es" ? "Revisa que el API este desplegado y vuelve a intentar." : "Check that the API is deployed and try again."}
          </p>
        </section>
      ) : null}

      {status === "ready" ? (
        <section className="grid gap-4">
          {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
          {orders.map((order) => {
            const allActions: Array<{ action: "cancel" | "return" | "refund-request"; target: OrderState; label: string }> = [
              { action: "cancel", target: "cancelled", label: locale === "es" ? "Cancelar pedido" : "Cancel order" },
              { action: "return", target: "return_requested", label: locale === "es" ? "Solicitar devolución" : "Request return" },
              { action: "refund-request", target: "refund_requested", label: locale === "es" ? "Solicitar reembolso" : "Request refund" }
            ];
            const actions = allActions.filter(({ target }) => canTransitionOrder(order.state, target));

            return (
              <article key={order.id} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-accent-2">{order.state}</p>
                    <h2 className="mt-1 text-xl font-semibold text-zinc-950">{order.number}</h2>
                    <p className="mt-1 text-sm text-zinc-500">{new Date(order.createdAt).toLocaleString(locale === "es" ? "es-CO" : "en-US")}</p>
                  </div>
                  <strong className="text-lg text-zinc-950">
                    {formatMoney(order.totals.total, "USD", locale === "es" ? "es-CO" : "en-US")}
                  </strong>
                </div>
                <div className="mt-4 grid gap-3">
                  {order.items.map((item) => (
                    <div key={`${order.id}-${item.productId}-${item.variantId ?? "default"}`} className="flex items-center gap-3 rounded-md bg-zinc-50 p-3">
                      <Image src={item.imageUrl} alt={item.name} width={56} height={56} className="h-14 w-14 rounded object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-zinc-950">{item.name}</p>
                        <p className="text-sm text-zinc-500">
                          {t.qty} {item.quantity} · {formatMoney(item.lineTotal, "USD", locale === "es" ? "es-CO" : "en-US")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {order.tracking ? (
                  <div className="mt-4 rounded-md border border-zinc-100 bg-zinc-50 p-3">
                    <p className="text-xs font-semibold uppercase text-zinc-500">{t.trackingHeading}</p>
                    <p className="mt-1 text-sm text-zinc-700">
                      {t.trackingCarrierNumber
                        .replace("{carrier}", order.tracking.carrier ?? "")
                        .replace("{number}", order.tracking.number ?? "")}
                    </p>
                    {order.tracking.url ? (
                      <a
                        href={order.tracking.url}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-ring mt-2 inline-block text-sm font-semibold text-accent-2 underline underline-offset-2"
                      >
                        {t.trackShipment}
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {actions.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
                    {actions.map(({ action, target, label }) => (
                      <button
                        key={action}
                        type="button"
                        disabled={pendingAction === `${order.id}:${action}`}
                        onClick={() => void runOrderAction(order.id, action, target)}
                        className="focus-ring min-h-9 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
