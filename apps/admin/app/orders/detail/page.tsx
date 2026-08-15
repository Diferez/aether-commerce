"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Package, RotateCcw, Truck } from "lucide-react";
import { useAuth } from "@clerk/react";
import { RequireAdminAuth } from "../../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../../components/config";

// Same reason as products/edit/page.tsx: output: "export" can't route a
// dynamic [id] segment for runtime-created order ids, so ?id= is read from
// window.location.search instead of next/navigation's useSearchParams().
function useOrderIdParam(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id"));
  }, []);
  return id;
}

type OrderItem = {
  productId: string;
  quantity: number;
  name: string;
  slug: string;
  imageUrl: string;
  unitPrice: number;
  finalUnitPrice: number;
  lineTotal: number;
  currency: string;
};

type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "partially_refunded";
type FulfillmentStatus = "unfulfilled" | "processing" | "shipped" | "delivered" | "cancelled";

type OrderDetail = {
  id: string;
  number: string;
  email: string;
  state: string;
  channel: "stripe" | "whatsapp";
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  items: OrderItem[];
  totals: { subtotal: number; discount: number; shipping: number; tax: number; total: number; currency: string };
  shippingAddress: { fullName: string; line1: string; city: string; region: string; postalCode: string; country: string };
  payment?: { providerPaymentIntentId?: string };
  internalNotes: string | null;
  tracking: { carrier: string | null; number: string | null; url: string | null } | null;
  createdAt: string;
  history: Array<{ id: string; previous_state: string | null; new_state: string; actor_id: string; reason: string | null; created_at: string }>;
};

const fulfillmentNext: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  unfulfilled: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: []
};

const paymentNext: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ["paid", "failed"],
  failed: ["pending"],
  paid: ["refunded", "partially_refunded"],
  partially_refunded: ["refunded"],
  refunded: []
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default function OrderDetailPage() {
  const id = useOrderIdParam();
  const { getToken, isLoaded: authLoaded } = useAuth();
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [trackingDraft, setTrackingDraft] = useState({ carrier: "", number: "", url: "" });
  const [actionStatus, setActionStatus] = useState<"idle" | "pending" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [refundConfirming, setRefundConfirming] = useState(false);

  const authHeader = useCallback(async () => {
    const token = await getToken().catch(() => null);
    return token ? { authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const load = useCallback(async () => {
    if (!id) return;
    const response = await fetch(`${apiBaseUrl}/api/v1/admin/orders/${encodeURIComponent(id)}`, {
      headers: await authHeader()
    });
    if (response.status === 404) {
      setState("not-found");
      return;
    }
    const payload = (await response.json()) as { success: boolean; data?: OrderDetail };
    if (!payload.success || !payload.data) {
      setState("error");
      return;
    }
    setOrder(payload.data);
    setNotesDraft(payload.data.internalNotes ?? "");
    setTrackingDraft({
      carrier: payload.data.tracking?.carrier ?? "",
      number: payload.data.tracking?.number ?? "",
      url: payload.data.tracking?.url ?? ""
    });
    setState("ready");
  }, [id, authHeader]);

  useEffect(() => {
    if (id === null || !authLoaded) return;
    if (!id) {
      setState("not-found");
      return;
    }
    setState("loading");
    void load().catch(() => setState("error"));
  }, [id, authLoaded, load]);

  async function runAction(path: string, method: "PATCH" | "POST", body: unknown) {
    if (!order) return;
    setActionStatus("pending");
    setActionError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/orders/${order.id}${path}`, {
        method,
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as { success: boolean; error?: { message?: string } };
      if (!payload.success) {
        setActionError(payload.error?.message ?? "The action could not be completed.");
        setActionStatus("error");
        return;
      }
      setActionStatus("idle");
      await load();
    } catch {
      setActionError("The action could not be completed.");
      setActionStatus("error");
    }
  }

  if (!id) {
    return (
      <RequireAdminAuth>
        <main id="main-content" className="admin-shell py-8">
          <NotFound />
        </main>
      </RequireAdminAuth>
    );
  }

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <a href="/orders/" className="focus-ring mb-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950">
          <ArrowLeft size={15} aria-hidden />
          Orders
        </a>

        {state === "loading" ? (
          <div className="grid gap-3">
            <div className="h-8 w-64 animate-pulse rounded bg-zinc-200" />
            <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />
          </div>
        ) : state === "not-found" ? (
          <NotFound />
        ) : state === "error" || !order ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-rose-800">
            Could not load this order. Try again in a moment.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-semibold text-zinc-950">
                  {order.number}
                  {order.channel === "whatsapp" ? <MessageCircle size={18} className="text-teal-700" aria-hidden /> : null}
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  {order.email} &middot; created {new Date(order.createdAt).toLocaleString()} &middot; state: {order.state}
                </p>
              </div>
              <span className="text-xl font-semibold text-zinc-950">{money(order.totals.total, order.totals.currency)}</span>
            </div>

            {actionError ? (
              <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{actionError}</div>
            ) : null}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="grid gap-6">
                <section className="rounded-lg border border-zinc-200 bg-white p-5">
                  <h2 className="text-lg font-semibold">Items</h2>
                  <div className="mt-3 grid gap-3">
                    {order.items.map((item) => (
                      <div key={item.productId} className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-3 last:border-b-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          {/* Plain <img>, not next/image - same as products list, arbitrary URLs */}
                          <img src={item.imageUrl} alt="" className="h-10 w-10 rounded-md border border-zinc-200 object-cover" />
                          <div>
                            <p className="font-medium text-zinc-950">{item.name}</p>
                            <p className="text-xs text-zinc-500">Qty {item.quantity}</p>
                          </div>
                        </div>
                        <span className="text-sm text-zinc-600">{money(item.lineTotal, item.currency)}</span>
                      </div>
                    ))}
                  </div>
                  <dl className="mt-4 grid gap-1 border-t border-zinc-100 pt-3 text-sm">
                    <div className="flex justify-between text-zinc-600">
                      <dt>Subtotal</dt>
                      <dd>{money(order.totals.subtotal, order.totals.currency)}</dd>
                    </div>
                    {order.totals.discount > 0 ? (
                      <div className="flex justify-between text-zinc-600">
                        <dt>Discount</dt>
                        <dd>-{money(order.totals.discount, order.totals.currency)}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between font-semibold text-zinc-950">
                      <dt>Total</dt>
                      <dd>{money(order.totals.total, order.totals.currency)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-lg border border-zinc-200 bg-white p-5">
                  <h2 className="text-lg font-semibold">Shipping address</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {order.shippingAddress.fullName}
                    <br />
                    {order.shippingAddress.line1}
                    <br />
                    {order.shippingAddress.city}, {order.shippingAddress.region} {order.shippingAddress.postalCode}
                    <br />
                    {order.shippingAddress.country}
                  </p>
                </section>

                <section className="rounded-lg border border-zinc-200 bg-white p-5">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Truck size={17} aria-hidden />
                    Tracking
                  </h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <input
                      value={trackingDraft.carrier}
                      onChange={(event) => setTrackingDraft((current) => ({ ...current, carrier: event.target.value }))}
                      placeholder="Carrier"
                      className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
                    />
                    <input
                      value={trackingDraft.number}
                      onChange={(event) => setTrackingDraft((current) => ({ ...current, number: event.target.value }))}
                      placeholder="Tracking number"
                      className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
                    />
                    <input
                      value={trackingDraft.url}
                      onChange={(event) => setTrackingDraft((current) => ({ ...current, url: event.target.value }))}
                      placeholder="Tracking URL"
                      className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={actionStatus === "pending"}
                    onClick={() =>
                      void runAction("/tracking", "PATCH", {
                        carrier: trackingDraft.carrier || null,
                        number: trackingDraft.number || null,
                        url: trackingDraft.url || null
                      })
                    }
                    className="focus-ring mt-3 min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save tracking
                  </button>
                </section>

                <section className="rounded-lg border border-zinc-200 bg-white p-5">
                  <h2 className="text-lg font-semibold">Internal notes</h2>
                  <p className="mt-1 text-sm text-zinc-500">Only visible to admin staff, never shown to the customer.</p>
                  <textarea
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    rows={4}
                    maxLength={2000}
                    className="focus-ring mt-3 w-full rounded-md border border-zinc-300 p-3 text-sm"
                  />
                  <button
                    type="button"
                    disabled={actionStatus === "pending"}
                    onClick={() => void runAction("/notes", "PATCH", { notes: notesDraft || null })}
                    className="focus-ring mt-3 min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save notes
                  </button>
                </section>

                <section className="rounded-lg border border-zinc-200 bg-white p-5">
                  <h2 className="text-lg font-semibold">Timeline</h2>
                  <ol className="mt-3 grid gap-3">
                    {order.history.map((entry) => (
                      <li key={entry.id} className="border-b border-zinc-100 pb-3 text-sm last:border-b-0 last:pb-0">
                        <p className="font-medium text-zinc-950">
                          {entry.previous_state ? `${entry.previous_state} -> ` : ""}
                          {entry.new_state}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {new Date(entry.created_at).toLocaleString()} &middot; {entry.actor_id}
                          {entry.reason ? ` · ${entry.reason}` : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>

              <div className="grid gap-6">
                <section className="rounded-lg border border-zinc-200 bg-white p-5">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Package size={17} aria-hidden />
                    Fulfillment
                  </h2>
                  <p className="mt-2 text-sm text-zinc-600">
                    Current: <span className="font-semibold text-zinc-950">{order.fulfillmentStatus.replaceAll("_", " ")}</span>
                  </p>
                  <div className="mt-3 grid gap-2">
                    {fulfillmentNext[order.fulfillmentStatus].length === 0 ? (
                      <p className="text-sm text-zinc-500">No further transitions available.</p>
                    ) : (
                      fulfillmentNext[order.fulfillmentStatus].map((next) => (
                        <button
                          key={next}
                          type="button"
                          disabled={actionStatus === "pending"}
                          onClick={() => void runAction("/fulfillment", "PATCH", { fulfillmentStatus: next })}
                          className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-left text-sm font-semibold hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Mark as {next.replaceAll("_", " ")}
                        </button>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-lg border border-zinc-200 bg-white p-5">
                  <h2 className="text-lg font-semibold">Payment</h2>
                  <p className="mt-2 text-sm text-zinc-600">
                    Current: <span className="font-semibold text-zinc-950">{order.paymentStatus.replaceAll("_", " ")}</span>
                  </p>

                  {order.channel === "whatsapp" ? (
                    <div className="mt-3 grid gap-2">
                      {paymentNext[order.paymentStatus].length === 0 ? (
                        <p className="text-sm text-zinc-500">No further transitions available.</p>
                      ) : (
                        paymentNext[order.paymentStatus].map((next) => (
                          <button
                            key={next}
                            type="button"
                            disabled={actionStatus === "pending"}
                            onClick={() => void runAction("/payment", "PATCH", { paymentStatus: next })}
                            className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-left text-sm font-semibold hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Mark as {next.replaceAll("_", " ")}
                          </button>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="mt-3">
                      <p className="text-sm text-zinc-500">
                        Stripe orders can only change payment status through a real refund below.
                      </p>
                      {(order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded") &&
                      order.payment?.providerPaymentIntentId ? (
                        <div className="mt-3">
                          {refundConfirming ? (
                            <div className="grid gap-2 rounded-md border border-rose-200 bg-rose-50 p-3">
                              <p className="text-sm font-semibold text-rose-800">
                                Refund the full amount ({money(order.totals.total, order.totals.currency)}) via Stripe?
                                This calls the real Stripe API and cannot be undone.
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={actionStatus === "pending"}
                                  onClick={() => {
                                    setRefundConfirming(false);
                                    void runAction("/refund", "POST", {});
                                  }}
                                  className="focus-ring min-h-9 rounded-md bg-rose-700 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Confirm refund
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRefundConfirming(false)}
                                  className="focus-ring min-h-9 rounded-md border border-zinc-300 px-3 text-sm font-semibold"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setRefundConfirming(true)}
                              className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md border border-rose-300 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                            >
                              <RotateCcw size={14} aria-hidden />
                              Refund via Stripe
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </main>
    </RequireAdminAuth>
  );
}

function NotFound() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center">
      <p className="font-semibold text-zinc-950">Order not found</p>
      <p className="mt-1 text-sm text-zinc-500">It may have been deleted, or the link is incorrect.</p>
    </div>
  );
}
