"use client";

import { useState } from "react";
import { useAuth } from "@clerk/react";
import { Plus, Search, Trash2 } from "lucide-react";
import { RequireAdminAuth } from "../../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../../components/config";
import { PageHeader } from "../../../components/PageHeader";
import { FormSection } from "../../../components/FormSection";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  final_price_cents: number;
};

type LineItem = { productId: string; name: string; unitPriceCents: number; quantity: number };

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function NewManualOrderPage() {
  const { getToken } = useAuth();
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!search.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const token = await getToken().catch(() => null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/admin/products?search=${encodeURIComponent(search)}&pageSize=8`,
        { headers: token ? { authorization: `Bearer ${token}` } : {} }
      );
      const payload = (await response.json()) as { success: boolean; data?: { data: ProductOption[] } };
      setResults(payload.success && payload.data ? payload.data.data : []);
    } finally {
      setSearching(false);
    }
  }

  function addItem(product: ProductOption) {
    setItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...current, { productId: product.id, name: product.name, unitPriceCents: product.final_price_cents, quantity: 1 }];
    });
  }

  function updateQuantity(productId: string, quantity: number) {
    setItems((current) => current.map((item) => (item.productId === productId ? { ...item, quantity: Math.max(1, quantity) } : item)));
  }

  function removeItem(productId: string) {
    setItems((current) => current.filter((item) => item.productId !== productId));
  }

  const subtotal = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || items.length === 0) return;
    setSubmitStatus("submitting");
    setSubmitError(null);
    const token = await getToken().catch(() => null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/orders/manual`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          email: email.trim(),
          items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
          notes: notes.trim() || undefined
        })
      });
      const payload = (await response.json()) as { success: boolean; data?: { id: string }; error?: { message?: string } };
      if (!payload.success || !payload.data) {
        setSubmitError(payload.error?.message ?? "Could not create the order.");
        setSubmitStatus("error");
        return;
      }
      window.location.href = `/orders/detail/?id=${encodeURIComponent(payload.data.id)}`;
    } catch {
      setSubmitError("Could not create the order.");
      setSubmitStatus("error");
    }
  }

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader
          title="New WhatsApp order"
          description="For sales coordinated by chat. Line items are priced from the live catalog, not typed by hand - the order starts as payment pending, and you confirm payment from the order detail page once you have it."
          breadcrumb={[{ label: "Orders", href: "/orders/" }]}
        />

        <form onSubmit={(event) => void submit(event)} className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-6">
            <FormSection title="Customer">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">Customer email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="customer@example.com"
                  className="focus-ring min-h-11 rounded-md border border-border bg-surface px-3 text-ink"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-muted">Internal notes (optional)</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Coordinated by WhatsApp on..."
                  className="focus-ring rounded-md border border-border bg-surface p-3 text-ink"
                />
              </label>
            </FormSection>

            <FormSection title="Add products">
              <form onSubmit={(event) => void runSearch(event)} className="flex items-center gap-2 rounded-md border border-border bg-bg px-3">
                <Search size={15} className="text-ink-subtle" aria-hidden />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name or SKU"
                  className="min-h-11 w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
                />
              </form>
              <div className="grid gap-2">
                {searching ? (
                  <p className="text-sm text-ink-muted">Searching...</p>
                ) : results.length === 0 ? (
                  <p className="text-sm text-ink-muted">Search the catalog to add line items.</p>
                ) : (
                  results.map((product) => (
                    <div key={product.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-ink">{product.name}</p>
                        <p className="text-xs text-ink-subtle">
                          SKU {product.sku} &middot; {money(product.final_price_cents)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addItem(product)}
                        className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-2.5 text-sm font-semibold text-ink hover:bg-surface-hover"
                      >
                        <Plus size={14} aria-hidden />
                        Add
                      </button>
                    </div>
                  ))
                )}
              </div>
            </FormSection>
          </div>

          <div className="grid gap-6">
            <FormSection title="Order summary">
              {items.length === 0 ? (
                <p className="text-sm text-ink-muted">No items yet.</p>
              ) : (
                <div className="grid gap-3">
                  {items.map((item) => (
                    <div key={item.productId} className="grid gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-ink">{item.name}</p>
                        <button
                          type="button"
                          onClick={() => removeItem(item.productId)}
                          aria-label={`Remove ${item.name}`}
                          className="focus-ring text-ink-subtle hover:text-danger"
                        >
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm text-ink-muted">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(event) => updateQuantity(item.productId, Number(event.target.value))}
                          className="focus-ring min-h-9 w-20 rounded-md border border-border bg-surface px-2 text-ink tabular-nums"
                        />
                        <span className="tabular-nums">{money(item.unitPriceCents * item.quantity)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold text-ink">
                <span>Subtotal</span>
                <span className="tabular-nums">{money(subtotal)}</span>
              </div>

              {submitError ? <p className="text-sm text-danger">{submitError}</p> : null}

              <button
                type="submit"
                disabled={submitStatus === "submitting" || !email.trim() || items.length === 0}
                className="focus-ring min-h-11 w-full rounded-md bg-accent text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-ink-subtle"
              >
                {submitStatus === "submitting" ? "Creating..." : "Create order"}
              </button>
            </FormSection>
          </div>
        </form>
      </main>
    </RequireAdminAuth>
  );
}
