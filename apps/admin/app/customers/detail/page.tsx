"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@clerk/react";
import { RequireAdminAuth } from "../../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../../components/config";
import { PageHeader } from "../../../components/PageHeader";
import { FormSection } from "../../../components/FormSection";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { StatusBadge } from "../../../components/StatusBadge";
import { ConfirmDialog } from "../../../components/ConfirmDialog";

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

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default function CustomerDetailPage() {
  const id = useCustomerIdParam();
  const { getToken, isLoaded: authLoaded } = useAuth();
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
        {state === "loading" ? (
          <div className="grid gap-3">
            <div className="skeleton h-8 w-64 rounded" />
            <div className="skeleton h-40 rounded-lg" />
          </div>
        ) : state === "not-found" ? (
          <NotFound />
        ) : state === "error" || !customer ? (
          <ErrorState title="Could not load this customer" />
        ) : (
          <>
            <PageHeader
              title={customer.name ?? customer.email}
              breadcrumb={[{ label: "Customers", href: "/customers/" }]}
              description={`${customer.email} · ${customer.source === "guest" ? "Guest checkout" : "Registered account"}`}
              meta={<StatusBadge tone={customer.status === "suspended" ? "error" : "success"}>{customer.status}</StatusBadge>}
            />

            {actionError ? (
              <div className="mb-4">
                <ErrorState title="Action failed" description={actionError} />
              </div>
            ) : null}

            {customer.source === "guest" ? (
              <div className="mb-6 rounded-lg border border-border bg-surface-hover p-4 text-sm text-ink-muted">
                This person checked out as a guest and has no Clerk account yet - there is nothing to suspend or promote until they sign up.
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="grid gap-6">
                <FormSection title="Order history">
                  {customer.orders.length === 0 ? (
                    <EmptyState title="No orders yet" />
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
                            {order.paymentStatus?.replaceAll("_", " ")} &middot; {order.fulfillmentStatus?.replaceAll("_", " ")}
                          </span>
                          <span className="text-sm tabular-nums text-ink-muted">{money(order.totals.total, order.totals.currency)}</span>
                          <span className="text-xs text-ink-subtle">{new Date(order.createdAt).toLocaleDateString()}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </FormSection>

                <FormSection
                  title={
                    <span className="flex items-center gap-2">
                      <MapPin size={16} aria-hidden />
                      Addresses
                    </span>
                  }
                >
                  {customer.addresses.length === 0 ? (
                    <p className="text-sm text-ink-muted">No saved addresses.</p>
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
                <FormSection title="Account access">
                  <p className="text-sm text-ink-muted">
                    Suspending blocks this person from signing in or making any authenticated request on their next request - not just future logins.
                  </p>
                  {customer.source === "registered" ? (
                    <button
                      type="button"
                      onClick={() => setSuspendConfirming(true)}
                      className={`focus-ring inline-flex min-h-10 items-center justify-self-start rounded-md border px-3 text-sm font-semibold ${
                        customer.status === "suspended" ? "border-success/30 text-success hover:bg-success-soft" : "border-danger/30 text-danger hover:bg-danger-soft"
                      }`}
                    >
                      {customer.status === "suspended" ? "Reactivate account" : "Suspend account"}
                    </button>
                  ) : null}
                </FormSection>

                <FormSection
                  title={
                    <span className="flex items-center gap-2">
                      <ShieldCheck size={16} aria-hidden />
                      Role
                    </span>
                  }
                >
                  <p className="text-sm text-ink-muted">
                    Current: <span className="font-semibold text-ink">{customer.roles.join(", ")}</span>
                  </p>
                  {customer.source === "registered" ? (
                    <>
                      <select
                        value={roleDraft}
                        onChange={(event) => setRoleDraft(event.target.value)}
                        className="focus-ring min-h-10 rounded-md border border-border bg-surface px-3 text-sm text-ink"
                      >
                        {assignableRoles.map((role) => (
                          <option key={role} value={role}>
                            {role.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={roleDraft === customer.roles[0]}
                        onClick={() => setRoleConfirming(true)}
                        className="focus-ring min-h-10 justify-self-start rounded-md border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Save role
                      </button>
                      <p className="text-xs text-ink-subtle">Only super admins can change roles - this action is rejected by the server otherwise.</p>
                    </>
                  ) : null}
                </FormSection>
              </div>
            </div>

            <ConfirmDialog
              open={suspendConfirming}
              title={customer.status === "suspended" ? "Reactivate this account?" : "Suspend this account?"}
              confirmLabel="Confirm"
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
              title="Change this person's role?"
              description={`Change this person's role to "${roleDraft.replaceAll("_", " ")}"? This calls Clerk directly and takes effect on their next request.`}
              confirmLabel="Confirm"
              pending={actionStatus === "pending"}
              onConfirm={() => {
                setRoleConfirming(false);
                void runAction("/role", { role: roleDraft });
              }}
              onCancel={() => setRoleConfirming(false)}
            />
          </>
        )}
      </main>
    </RequireAdminAuth>
  );
}

function NotFound() {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <EmptyState title="Customer not found" description="It may have been deleted, or the link is incorrect." icon={UserRound} />
    </div>
  );
}
