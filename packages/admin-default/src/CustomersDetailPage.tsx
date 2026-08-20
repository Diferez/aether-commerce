"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { MapPin, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@clerk/react";
import { RequireAdminAuth } from "./RequireAdminAuth";
import { useAdminConfig } from "./AetherAdminProvider";
import { PageHeader } from "./PageHeader";
import { FormSection } from "./FormSection";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { StatusBadge } from "./StatusBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { useAdminLanguage } from "./AdminLanguageProvider";
import type { AdminDictionary } from "@aether/i18n";

// Same reason as orders/detail/page.tsx: output: "export" can't route a
// dynamic [id] segment for runtime ids (and customer ids can be a raw
// email-derived guest id, never a clean slug), so ?id= is read from
// window.location.search instead of next/navigation's useSearchParams().
function useCustomerIdParam(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id"));
  }, []);
  return id;
}

type CustomerAddress = {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

type CustomerOrder = {
  id: string;
  number: string;
  state: string;
  channel: "stripe" | "whatsapp";
  paymentStatus: string;
  fulfillmentStatus: string;
  totals: { total: number; currency: string };
  createdAt: string;
};

type CustomerDetail = {
  id: string;
  source: "registered" | "guest";
  name: string | null;
  email: string;
  roles: string[];
  status: "active" | "suspended";
  createdAt: string | null;
  addresses: CustomerAddress[];
  orders: CustomerOrder[];
};

const assignableRoles = ["customer", "support", "catalog_manager", "order_manager", "admin", "super_admin", "demo_viewer"] as const;

function money(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-US", { style: "currency", currency }).format(cents / 100);
}

function orderStatusLabel(t: AdminDictionary, value: string | undefined) {
  if (!value) return "";
  const raw = (t.orderStatus as Record<string, string>)[value] ?? value.replaceAll("_", " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function roleLabel(t: AdminDictionary, role: string) {
  return (t.customerDetailPage.roleLabels as Record<string, string>)[role] ?? role.replaceAll("_", " ");
}

function NotFound({ t }: Readonly<{ t: AdminDictionary }>) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <EmptyState title={t.customerDetailPage.customerNotFoundTitle} description={t.customerDetailPage.customerNotFoundDescription} icon={UserRound} />
    </div>
  );
}

function pageBody(
  state: "loading" | "ready" | "not-found" | "error",
  customer: CustomerDetail | null,
  t: AdminDictionary,
  locale: string,
  actionError: string | null,
  roleDraft: string,
  onRoleDraftChange: (role: string) => void,
  onSuspendConfirm: () => void,
  onRoleConfirm: () => void
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
  if (state === "error" || !customer) return <ErrorState title={t.customerDetailPage.couldNotLoadCustomer} />;

  return (
    <>
      <PageHeader
        title={customer.name ?? customer.email}
        breadcrumb={[{ label: t.customerDetailPage.customersBreadcrumb, href: "/customers/" }]}
        description={`${customer.email} · ${customer.source === "guest" ? t.dashboard.guestCheckout : t.customerDetailPage.registeredAccountLabel}`}
        meta={<StatusBadge tone={customer.status === "suspended" ? "error" : "success"}>{t.customerStatus[customer.status]}</StatusBadge>}
      />

      {actionError ? (
        <div className="mb-4">
          <ErrorState title={t.customerDetailPage.actionFailed} description={actionError} />
        </div>
      ) : null}

      {customer.source === "guest" ? (
        <div className="mb-6 rounded-lg border border-border bg-surface-hover p-4 text-sm text-ink-muted">{t.customerDetailPage.guestNoticeText}</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-6">
          <FormSection title={t.customerDetailPage.orderHistorySection}>
            {customer.orders.length === 0 ? (
              <EmptyState title={t.customerDetailPage.noOrdersYetTitle} />
            ) : (
              <div className="grid gap-2">
                {customer.orders.map((order) => (
                  <a
                    key={order.id}
                    href={`/orders/detail/?id=${encodeURIComponent(order.id)}`}
                    className="focus-ring grid gap-1 rounded-md border border-border p-3 hover:bg-surface-hover sm:grid-cols-[140px_1fr_120px_100px] sm:items-center sm:gap-3"
                  >
                    <strong className="text-ink">{order.number}</strong>
                    <span className="text-sm text-ink-muted">
                      {orderStatusLabel(t, order.paymentStatus)} &middot; {orderStatusLabel(t, order.fulfillmentStatus)}
                    </span>
                    <span className="text-sm tabular-nums text-ink-muted">{money(order.totals.total, order.totals.currency, locale)}</span>
                    <span className="text-xs text-ink-subtle">{new Date(order.createdAt).toLocaleDateString(locale === "es" ? "es-ES" : "en-US")}</span>
                  </a>
                ))}
              </div>
            )}
          </FormSection>

          <FormSection
            title={
              <span className="flex items-center gap-2">
                <MapPin size={16} aria-hidden />
                {t.customerDetailPage.addressesSection}
              </span>
            }
          >
            {customer.addresses.length === 0 ? (
              <p className="text-sm text-ink-muted">{t.customerDetailPage.noSavedAddresses}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {customer.addresses.map((address, index) => (
                  <div key={index} className="rounded-md border border-border p-3 text-sm text-ink-muted">
                    <p className="font-medium text-ink">{address.fullName}</p>
                    <p>{address.line1}</p>
                    {address.line2 ? <p>{address.line2}</p> : null}
                    <p>
                      {address.city}, {address.region} {address.postalCode}
                    </p>
                    <p>{address.country}</p>
                  </div>
                ))}
              </div>
            )}
          </FormSection>
        </div>

        <div className="grid gap-6">
          <FormSection title={t.customerDetailPage.accountAccessSection}>
            <p className="text-sm text-ink-muted">{t.customerDetailPage.suspendingBlocksText}</p>
            {customer.source === "registered" ? (
              <button
                type="button"
                onClick={onSuspendConfirm}
                className={`focus-ring inline-flex min-h-10 items-center justify-self-start rounded-md border px-3 text-sm font-semibold ${
                  customer.status === "suspended" ? "border-success/30 text-success hover:bg-success-soft" : "border-danger/30 text-danger hover:bg-danger-soft"
                }`}
              >
                {customer.status === "suspended" ? t.customerDetailPage.reactivateAccount : t.customerDetailPage.suspendAccount}
              </button>
            ) : null}
          </FormSection>

          <FormSection
            title={
              <span className="flex items-center gap-2">
                <ShieldCheck size={16} aria-hidden />
                {t.customerDetailPage.roleSection}
              </span>
            }
          >
            <p className="text-sm text-ink-muted">
              {t.customerDetailPage.current} <span className="font-semibold text-ink">{customer.roles.map((role) => roleLabel(t, role)).join(", ")}</span>
            </p>
            {customer.source === "registered" ? (
              <>
                <select
                  value={roleDraft}
                  onChange={(event) => onRoleDraftChange(event.target.value)}
                  className="focus-ring min-h-10 rounded-md border border-border bg-surface px-3 text-sm text-ink"
                >
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(t, role)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={roleDraft === customer.roles[0]}
                  onClick={onRoleConfirm}
                  className="focus-ring min-h-10 justify-self-start rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t.customerDetailPage.saveRole}
                </button>
                <p className="text-xs text-ink-subtle">{t.customerDetailPage.onlySuperAdminsCanChangeRoles}</p>
              </>
            ) : null}
          </FormSection>
        </div>
      </div>
    </>
  );
}

export function CustomersDetailPage() {
  const id = useCustomerIdParam();
  const { getToken, isLoaded: authLoaded } = useAuth();
  const { apiBaseUrl } = useAdminConfig();
  const { t, locale } = useAdminLanguage();
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [roleDraft, setRoleDraft] = useState<string>("customer");
  const [actionStatus, setActionStatus] = useState<"idle" | "pending" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [suspendConfirming, setSuspendConfirming] = useState(false);
  const [roleConfirming, setRoleConfirming] = useState(false);

  const authHeader = useCallback(async () => {
    const token = await getToken().catch(() => null);
    return token ? { authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const load = useCallback(async () => {
    if (!id) return;
    const response = await fetch(`${apiBaseUrl}/api/v1/admin/users/${encodeURIComponent(id)}`, {
      headers: await authHeader()
    });
    if (response.status === 404) {
      setState("not-found");
      return;
    }
    const payload = (await response.json()) as { success: boolean; data?: CustomerDetail };
    if (!payload.success || !payload.data) {
      setState("error");
      return;
    }
    setCustomer(payload.data);
    setRoleDraft(payload.data.roles[0] ?? "customer");
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

  async function runAction(path: string, body: unknown) {
    if (!customer) return;
    setActionStatus("pending");
    setActionError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/users/${encodeURIComponent(customer.id)}${path}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as { success: boolean; error?: { message?: string } };
      if (!payload.success) {
        setActionError(payload.error?.message ?? t.customerDetailPage.actionCouldNotComplete);
        setActionStatus("error");
        return;
      }
      setActionStatus("idle");
      await load();
    } catch {
      setActionError(t.customerDetailPage.actionCouldNotComplete);
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
        {pageBody(state, customer, t, locale, actionError, roleDraft, setRoleDraft, () => setSuspendConfirming(true), () => setRoleConfirming(true))}

        {customer ? (
          <>
            <ConfirmDialog
              open={suspendConfirming}
              title={customer.status === "suspended" ? t.customerDetailPage.reactivateThisAccountTitle : t.customerDetailPage.suspendThisAccountTitle}
              confirmLabel={t.common.confirm}
              tone={customer.status === "suspended" ? "default" : "danger"}
              pending={actionStatus === "pending"}
              onConfirm={() => {
                setSuspendConfirming(false);
                void runAction("/status", { status: customer.status === "suspended" ? "active" : "suspended" });
              }}
              onCancel={() => setSuspendConfirming(false)}
            />

            <ConfirmDialog
              open={roleConfirming}
              title={t.customerDetailPage.changeRoleTitle}
              description={t.customerDetailPage.changeRoleDescription.replace("{role}", roleLabel(t, roleDraft))}
              confirmLabel={t.common.confirm}
              pending={actionStatus === "pending"}
              onConfirm={() => {
                setRoleConfirming(false);
                void runAction("/role", { role: roleDraft });
              }}
              onCancel={() => setRoleConfirming(false)}
            />
          </>
        ) : null}
      </main>
    </RequireAdminAuth>
  );
}
