"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { PackageCheck, ShoppingBag } from "lucide-react";
import { formatUsd } from "@aether/core";
import { createAetherClient } from "@aether/api-client";
import type { Order } from "@aether/schemas";
import { apiBaseUrl, storefrontPath } from "../../../components/config";
import { useCustomerSession } from "../../../components/customer-client";
import { useLanguage } from "../../../components/LanguageProvider";

type OrderStatus = "loading" | "ready" | "empty" | "signed-out" | "error";

export default function OrdersPage() {
  const { locale, t } = useLanguage();
  const { customer, isLoaded } = useCustomerSession();
  const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<OrderStatus>("loading");

  useEffect(() => {
    if (!isLoaded || !isAuthLoaded) return;
    if (!customer || !isSignedIn) {
      setOrders([]);
      setStatus("signed-out");
      return;
    }

    let active = true;
    setStatus("loading");
    const client = createAetherClient({
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
  }, [isLoaded, isAuthLoaded, isSignedIn, customer, getToken]);

  return (
    <main className="aether-shell py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase text-teal-700">
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
        <a
          href={storefrontPath("/products")}
          className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white"
        >
          <ShoppingBag size={17} aria-hidden />
          {t.browseProducts}
        </a>
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
          <a
            href={storefrontPath("/login")}
            className="focus-ring mt-5 inline-flex min-h-11 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white"
          >
            {t.signIn}
          </a>
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
          {orders.map((order) => (
            <article key={order.id} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-teal-700">{order.state}</p>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-950">{order.number}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{new Date(order.createdAt).toLocaleString(locale === "es" ? "es-CO" : "en-US")}</p>
                </div>
                <strong className="text-lg text-zinc-950">
                  {formatUsd(order.totals.total, locale === "es" ? "es-CO" : "en-US")}
                </strong>
              </div>
              <div className="mt-4 grid gap-3">
                {order.items.map((item) => (
                  <div key={`${order.id}-${item.productId}-${item.variantId ?? "default"}`} className="flex items-center gap-3 rounded-md bg-zinc-50 p-3">
                    <img src={item.imageUrl} alt={item.name} className="h-14 w-14 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-zinc-950">{item.name}</p>
                      <p className="text-sm text-zinc-500">
                        {t.qty} {item.quantity} · {formatUsd(item.lineTotal, locale === "es" ? "es-CO" : "en-US")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
