"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@clerk/react";
import { RequireAdminAuth } from "../../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../../components/config";

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
        <main className="admin-shell py-8">
          <NotFound />
        </main>
      </RequireAdminAuth>
    );
  }

  return (
    <RequireAdminAuth>
      <main className="admin-shell py-8">
        <a href="/customers/" className="focus-ring mb-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950">
          <ArrowLeft size={15} aria-hidden />
          Customers
        </a>

        {state === "loading" ? (
          <div className="grid gap-3">
            <div className="h-8 w-64 animate-pulse rounded bg-zinc-200" />
            <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />
          </div>
        ) : state === "not-found" ? (
          <NotFound />
        ) : state === "error" || !customer ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-rose-800">
            Could not load this customer. Try again in a moment.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500">
                  <UserRound size={20} aria-hidden />
                </span>
                <div>
                  <h1 className="text-2xl font-semibold text-zinc-950">{customer.name ?? customer.email}</h1>
                  <p className="mt-1 text-sm text-zinc-500">
                    {customer.email} &middot; {customer.source === "guest" ? "Guest checkout" : "Registered account"}
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  customer.status === "suspended" ? "bg-rose-50 text-rose-700" : "bg-teal-50 text-teal-700"
                }`}
              >
                {customer.status}
              </span>
            </div>

            {actionError ? (
              <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{actionError}</div>
            ) : null}

            {customer.source === "guest" ? (
              <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                This person checked out as a guest and has no Clerk account yet - there is nothing to suspend or
                promote until they sign up.
              </div>
            ) : null}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="grid gap-6">
                <section className="rounded-lg border border-zinc-200 bg-white p-5">
                  <h2 className="text-lg font-semibold">Order history</h2>
                  {customer.orders.length === 0 ? (
                    <p className="mt-3 text-sm text-zinc-500">No orders yet.</p>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {customer.orders.map((order) => (
                        <a
                          key={order.id}
                          href={`/orders/detail/?id=${encodeURIComponent(order.id)}`}
                          className="focus-ring grid gap-1 rounded-md border border-zinc-200 p-3 hover:bg-zinc-50 sm:grid-cols-[140px_1fr_120px_100px] sm:items-center sm:gap-3"
                        >
                          <strong className="text-zinc-950">{order.number}</strong>
                          <span className="text-sm text-zinc-600">
                            {order.paymentStatus?.replaceAll("_", " ")} &middot; {order.fulfillmentStatus?.replaceAll("_", " ")}
                          </span>
                          <span className="text-sm text-zinc-600">{money(order.totals.total, order.totals.currency)}</span>
                          <span className="text-xs text-zinc-500">{new Date(order.createdAt).toLocaleDateString()}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-lg border border-zinc-200 bg-white p-5">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <MapPin size={17} aria-hidden />
                    Addresses
                  </h2>
                  {customer.addresses.length === 0 ? (
                    <p className="mt-3 text-sm text-zinc-500">No saved addresses.</p>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {customer.addresses.map((address, index) => (
                        <div key={index} className="rounded-md border border-zinc-200 p-3 text-sm text-zinc-600">
                          <p className="font-medium text-zinc-950">{address.fullName}</p>
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
                </section>
              </div>

              <div className="grid gap-6">
                <section className="rounded-lg border border-zinc-200 bg-white p-5">
                  <h2 className="text-lg font-semibold">Account access</h2>
                  <p className="mt-2 text-sm text-zinc-600">
                    Suspending blocks this person from signing in or making any authenticated request on their next
                    request - not just future logins.
                  </p>
                  {customer.source === "registered" ? (
                    suspendConfirming ? (
                      <div className="mt-3 grid gap-2 rounded-md border border-rose-200 bg-rose-50 p-3">
                        <p className="text-sm font-semibold text-rose-800">
                          {customer.status === "suspended" ? "Reactivate this account?" : "Suspend this account?"}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={actionStatus === "pending"}
                            onClick={() => {
                              setSuspendConfirming(false);
                              void runAction("/status", { status: customer.status === "suspended" ? "active" : "suspended" });
                            }}
                            className="focus-ring min-h-9 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setSuspendConfirming(false)}
                            className="focus-ring min-h-9 rounded-md border border-zinc-300 px-3 text-sm font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSuspendConfirming(true)}
                        className={`focus-ring mt-3 inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-semibold ${
                          customer.status === "suspended"
                            ? "border-teal-300 text-teal-700 hover:bg-teal-50"
                            : "border-rose-300 text-rose-700 hover:bg-rose-50"
                        }`}
                      >
                        {customer.status === "suspended" ? "Reactivate account" : "Suspend account"}
                      </button>
                    )
                  ) : null}
                </section>

                <section className="rounded-lg border border-zinc-200 bg-white p-5">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <ShieldCheck size={17} aria-hidden />
                    Role
                  </h2>
                  <p className="mt-2 text-sm text-zinc-600">
                    Current: <span className="font-semibold text-zinc-950">{customer.roles.join(", ")}</span>
                  </p>
                  {customer.source === "registered" ? (
                    <div className="mt-3 grid gap-2">
                      <select
                        value={roleDraft}
                        onChange={(event) => setRoleDraft(event.target.value)}
                        className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
                      >
                        {assignableRoles.map((role) => (
                          <option key={role} value={role}>
                            {role.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                      {roleConfirming ? (
                        <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                          <p className="text-sm font-semibold text-amber-900">
                            Change this person&apos;s role to &quot;{roleDraft.replaceAll("_", " ")}&quot;? This calls
                            Clerk directly and takes effect on their next request.
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={actionStatus === "pending"}
                              onClick={() => {
                                setRoleConfirming(false);
                                void runAction("/role", { role: roleDraft });
                              }}
                              className="focus-ring min-h-9 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setRoleConfirming(false)}
                              className="focus-ring min-h-9 rounded-md border border-zinc-300 px-3 text-sm font-semibold"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={roleDraft === customer.roles[0]}
                          onClick={() => setRoleConfirming(true)}
                          className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Save role
                        </button>
                      )}
                      <p className="text-xs text-zinc-500">
                        Only super admins can change roles - this action is rejected by the server otherwise.
                      </p>
                    </div>
                  ) : null}
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
      <p className="font-semibold text-zinc-950">Customer not found</p>
      <p className="mt-1 text-sm text-zinc-500">It may have been deleted, or the link is incorrect.</p>
    </div>
  );
}
