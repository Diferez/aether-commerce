"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { MessageCircle, Package, RotateCcw } from "lucide-react";
import { useAuth } from "@clerk/react";
import { RequireAdminAuth } from "./RequireAdminAuth";
import { useAdminConfig } from "./AetherAdminProvider";
import { PageHeader } from "./PageHeader";
import { FormSection } from "./FormSection";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { StatusBadge, type StatusTone } from "./StatusBadge";
import { ActivityTimeline } from "./ActivityTimeline";
import { ConfirmDialog } from "./ConfirmDialog";
import { useAdminLanguage } from "./AdminLanguageProvider";
import type { AdminDictionary } from "@aether/i18n";

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

const paymentTone: Record<PaymentStatus, StatusTone> = {
  pending: "pending",
  paid: "success",
  failed: "error",
  refunded: "neutral",
  partially_refunded: "warning"
};

const fulfillmentTone: Record<FulfillmentStatus, StatusTone> = {
  unfulfilled: "neutral",
  processing: "in-process",
  shipped: "info",
  delivered: "success",
  cancelled: "error"
};

function money(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-US", { style: "currency", currency }).format(cents / 100);
}

function statusLabel(t: AdminDictionary, value: string) {
  const raw = (t.orderStatus as Record<string, string>)[value] ?? value.replaceAll("_", " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function refundProviderLabel(channel: string): string {
  return channel === "wompi" ? "Wompi" : "Stripe";
}

function NotFound({ t }: Readonly<{ t: AdminDictionary }>) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <EmptyState title={t.orderDetailPage.orderNotFoundTitle} description={t.orderDetailPage.orderNotFoundDescription} />
    </div>
  );
}

function pageBody(
  state: "loading" | "ready" | "not-found" | "error",
  order: OrderDetail | null,
  t: AdminDictionary,
  locale: string,
  actionError: string | null,
  actionStatus: "idle" | "pending" | "error",
  trackingDraft: { carrier: string; number: string; url: string },
  onTrackingDraftChange: (draft: { carrier: string; number: string; url: string }) => void,
  notesDraft: string,
  onNotesDraftChange: (notes: string) => void,
  onRunAction: (path: string, method: "PATCH" | "POST", body: unknown) => void,
  onRefundConfirm: () => void
): ReactNode {
  if (state === "loading") {
    return (
      <div className="grid gap-3">
        <div className="skeleton h-8 w-64 rounded" />
        <div className="skeleton h-40 rounded-lg" />
      </div>
    );
  }
  if (state === "not-found") return <NotFound t={t} />;
  if (state === "error" || !order) return <ErrorState title={t.orderDetailPage.couldNotLoadOrder} />;

  return (
    <>
      <PageHeader
        title={order.number}
        breadcrumb={[{ label: t.orderDetailPage.ordersBreadcrumb, href: "/orders/" }]}
        description={t.orderDetailPage.descriptionTemplate
          .replace("{email}", order.email)
          .replace("{date}", new Date(order.createdAt).toLocaleString(locale === "es" ? "es-ES" : "en-US"))
          .replace("{state}", order.state)}
        meta={
          <>
            {order.channel === "whatsapp" ? <MessageCircle size={18} className="text-accent-2" aria-hidden /> : null}
            <StatusBadge tone={paymentTone[order.paymentStatus]}>{statusLabel(t, order.paymentStatus)}</StatusBadge>
            <StatusBadge tone={fulfillmentTone[order.fulfillmentStatus]}>{statusLabel(t, order.fulfillmentStatus)}</StatusBadge>
          </>
        }
        primaryAction={<span className="text-xl font-semibold tabular-nums text-ink">{money(order.totals.total, order.totals.currency, locale)}</span>}
      />

      {actionError ? (
        <div className="mb-4">
          <ErrorState title={t.orderDetailPage.actionFailed} description={actionError} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-6">
          <FormSection title={t.orderDetailPage.itemsSection}>
            <div className="grid gap-3">
              {order.items.map((item) => (
                <div key={item.productId} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    {/* Plain <img>, not next/image - same as products list, arbitrary URLs */}
                    <img src={item.imageUrl} alt="" className="h-10 w-10 rounded-md border border-border object-cover" />
                    <div>
                      <p className="font-medium text-ink">{item.name}</p>
                      <p className="text-xs text-ink-subtle">{t.orderDetailPage.qtyLabel.replace("{count}", String(item.quantity))}</p>
                    </div>
                  </div>
                  <span className="text-sm tabular-nums text-ink-muted">{money(item.lineTotal, item.currency, locale)}</span>
                </div>
              ))}
            </div>
            <dl className="grid gap-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between text-ink-muted">
                <dt>{t.orderDetailPage.subtotal}</dt>
                <dd className="tabular-nums">{money(order.totals.subtotal, order.totals.currency, locale)}</dd>
              </div>
              {order.totals.discount > 0 ? (
                <div className="flex justify-between text-ink-muted">
                  <dt>{t.orderDetailPage.discount}</dt>
                  <dd className="tabular-nums">-{money(order.totals.discount, order.totals.currency, locale)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between font-semibold text-ink">
                <dt>{t.orderDetailPage.total}</dt>
                <dd className="tabular-nums">{money(order.totals.total, order.totals.currency, locale)}</dd>
              </div>
            </dl>
          </FormSection>

          <FormSection title={t.orderDetailPage.shippingAddressSection}>
            <p className="text-sm leading-6 text-ink-muted">
              {order.shippingAddress.fullName}
              <br />
              {order.shippingAddress.line1}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.region} {order.shippingAddress.postalCode}
              <br />
              {order.shippingAddress.country}
            </p>
          </FormSection>

          <FormSection title={t.orderDetailPage.trackingSection}>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={trackingDraft.carrier}
                onChange={(event) => onTrackingDraftChange({ ...trackingDraft, carrier: event.target.value })}
                placeholder={t.orderDetailPage.carrierPlaceholder}
                className="focus-ring min-h-10 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              />
              <input
                value={trackingDraft.number}
                onChange={(event) => onTrackingDraftChange({ ...trackingDraft, number: event.target.value })}
                placeholder={t.orderDetailPage.trackingNumberPlaceholder}
                className="focus-ring min-h-10 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              />
              <input
                value={trackingDraft.url}
                onChange={(event) => onTrackingDraftChange({ ...trackingDraft, url: event.target.value })}
                placeholder={t.orderDetailPage.trackingUrlPlaceholder}
                className="focus-ring min-h-10 rounded-md border border-border bg-surface px-3 text-sm text-ink"
              />
            </div>
            <button
              type="button"
              disabled={actionStatus === "pending"}
              onClick={() =>
                onRunAction("/tracking", "PATCH", {
                  carrier: trackingDraft.carrier || null,
                  number: trackingDraft.number || null,
                  url: trackingDraft.url || null
                })
              }
              className="focus-ring min-h-10 justify-self-start rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.orderDetailPage.saveTracking}
            </button>
          </FormSection>

          <FormSection title={t.orderDetailPage.internalNotesSection} description={t.orderDetailPage.internalNotesDescription}>
            <textarea
              value={notesDraft}
              onChange={(event) => onNotesDraftChange(event.target.value)}
              rows={4}
              maxLength={2000}
              className="focus-ring w-full rounded-md border border-border bg-surface p-3 text-sm text-ink"
            />
            <button
              type="button"
              disabled={actionStatus === "pending"}
              onClick={() => onRunAction("/notes", "PATCH", { notes: notesDraft || null })}
              className="focus-ring min-h-10 justify-self-start rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.orderDetailPage.saveNotes}
            </button>
          </FormSection>

          <FormSection title={t.orderDetailPage.timelineSection}>
            <ActivityTimeline
              items={order.history.map((entry) => ({
                id: entry.id,
                title: entry.previous_state ? `${statusLabel(t, entry.previous_state)} -> ${statusLabel(t, entry.new_state)}` : statusLabel(t, entry.new_state),
                ...(entry.reason ? { detail: entry.reason } : {}),
                timestamp: `${new Date(entry.created_at).toLocaleString(locale === "es" ? "es-ES" : "en-US")} · ${entry.actor_id}`
              }))}
            />
          </FormSection>
        </div>

        <div className="grid gap-6">
          <FormSection title={t.orderDetailPage.fulfillmentSection}>
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Package size={15} aria-hidden />
              {t.orderDetailPage.current} <span className="font-semibold text-ink">{statusLabel(t, order.fulfillmentStatus)}</span>
            </div>
            <div className="grid gap-2">
              {fulfillmentNext[order.fulfillmentStatus].length === 0 ? (
                <p className="text-sm text-ink-muted">{t.orderDetailPage.noFurtherTransitions}</p>
              ) : (
                fulfillmentNext[order.fulfillmentStatus].map((next) => (
                  <button
                    key={next}
                    type="button"
                    disabled={actionStatus === "pending"}
                    onClick={() => onRunAction("/fulfillment", "PATCH", { fulfillmentStatus: next })}
                    className="focus-ring min-h-10 rounded-md border border-border-strong px-3 text-left text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t.orderDetailPage.markAs.replace("{status}", statusLabel(t, next))}
                  </button>
                ))
              )}
            </div>
          </FormSection>

          <FormSection title={t.orderDetailPage.paymentSection}>
            <p className="text-sm text-ink-muted">
              {t.orderDetailPage.current} <span className="font-semibold text-ink">{statusLabel(t, order.paymentStatus)}</span>
            </p>

            {order.channel === "whatsapp" ? (
              <div className="grid gap-2">
                {paymentNext[order.paymentStatus].length === 0 ? (
                  <p className="text-sm text-ink-muted">{t.orderDetailPage.noFurtherTransitions}</p>
                ) : (
                  paymentNext[order.paymentStatus].map((next) => (
                    <button
                      key={next}
                      type="button"
                      disabled={actionStatus === "pending"}
                      onClick={() => onRunAction("/payment", "PATCH", { paymentStatus: next })}
                      className="focus-ring min-h-10 rounded-md border border-border-strong px-3 text-left text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.orderDetailPage.markAs.replace("{status}", statusLabel(t, next))}
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm text-ink-muted">{t.orderDetailPage.refundOnlyVia}</p>
                {(order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded") && order.payment?.providerPaymentIntentId ? (
                  <button
                    type="button"
                    onClick={onRefundConfirm}
                    className="focus-ring mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-danger/30 px-3 text-sm font-semibold text-danger hover:bg-danger-soft"
                  >
                    <RotateCcw size={14} aria-hidden />
                    {t.orderDetailPage.refundVia.replace("{provider}", refundProviderLabel(order.channel))}
                  </button>
                ) : null}
              </div>
            )}
          </FormSection>
        </div>
      </div>
    </>
  );
}

export function OrdersDetailPage() {
  const id = useOrderIdParam();
  const { getToken, isLoaded: authLoaded } = useAuth();
  const { apiBaseUrl } = useAdminConfig();
  const { t, locale } = useAdminLanguage();
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
  }, [id, authHeader, apiBaseUrl]);

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
        setActionError(payload.error?.message ?? t.orderDetailPage.actionCouldNotComplete);
        setActionStatus("error");
        return;
      }
      setActionStatus("idle");
      await load();
    } catch {
      setActionError(t.orderDetailPage.actionCouldNotComplete);
      setActionStatus("error");
    }
  }

  if (!id) {
    return (
      <RequireAdminAuth>
        <main id="main-content" className="admin-shell py-8">
          <NotFound t={t} />
        </main>
      </RequireAdminAuth>
    );
  }

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        {pageBody(
          state,
          order,
          t,
          locale,
          actionError,
          actionStatus,
          trackingDraft,
          setTrackingDraft,
          notesDraft,
          setNotesDraft,
          (path, method, body) => void runAction(path, method, body),
          () => setRefundConfirming(true)
        )}

        {order ? (
          <ConfirmDialog
            open={refundConfirming}
            title={t.orderDetailPage.refundViaTitle.replace("{provider}", refundProviderLabel(order.channel))}
            description={t.orderDetailPage.refundDescription
              .replace("{amount}", money(order.totals.total, order.totals.currency, locale))
              .replaceAll("{provider}", refundProviderLabel(order.channel))}
            confirmLabel={t.orderDetailPage.confirmRefund}
            tone="danger"
            pending={actionStatus === "pending"}
            onConfirm={() => {
              setRefundConfirming(false);
              void runAction("/refund", "POST", {});
            }}
            onCancel={() => setRefundConfirming(false)}
          />
        ) : null}
      </main>
    </RequireAdminAuth>
  );
}
