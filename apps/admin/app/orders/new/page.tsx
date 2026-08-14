"use client";

import { useState } from "react";
import { useAuth } from "@clerk/react";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import { RequireAdminAuth } from "../../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../../components/config";

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
      <main className="admin-shell py-8">
        <a href="/orders/" className="focus-ring mb-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950">
          <ArrowLeft size={15} aria-hidden />
          Orders
        </a>

        <h1 className="text-2xl font-semibold text-zinc-950">New WhatsApp order</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          For sales coordinated by chat. Line items are priced from the live catalog, not typed by hand - the
          order starts as payment pending, and you confirm payment from the order detail page once you have it.
        </p>

        <form onSubmit={(event) => void submit(event)} className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-6">
            <section className="rounded-lg border border-zinc-200 bg-white p-5">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-zinc-700">Customer email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="customer@example.com"
                  className="focus-ring min-h-11 rounded-md border border-zinc-300 px-3"
                />
              </label>
              <label className="mt-4 grid gap-1 text-sm">
                <span className="font-medium text-zinc-700">Internal notes (optional)</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Coordinated by WhatsApp on..."
                  className="focus-ring rounded-md border border-zinc-300 p-3"
                />
              </label>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Add products</h2>
              <form onSubmit={(event) => void runSearch(event)} className="mt-3 flex items-center gap-2 rounded-md border border-zinc-300 px-3">
                <Search size={15} className="text-zinc-400" aria-hidden />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name or SKU"
                  className="min-h-11 w-full border-0 bg-transparent text-sm outline-none"
                />
              </form>
              <div className="mt-3 grid gap-2">
                {searching ? (
                  <p className="text-sm text-zinc-500">Searching...</p>
                ) : results.length === 0 ? (
                  <p className="text-sm text-zinc-500">Search the catalog to add line items.</p>
                ) : (
                  results.map((product) => (
                    <div key={product.id} className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-zinc-950">{product.name}</p>
                        <p className="text-xs text-zinc-500">
                          SKU {product.sku} &middot; {money(product.final_price_cents)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addItem(product)}
                        className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 text-sm font-semibold hover:bg-zinc-50"
                      >
                        <Plus size={14} aria-hidden />
                        Add
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="grid gap-6">
            <section className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Order summary</h2>
              {items.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">No items yet.</p>
              ) : (
                <div className="mt-3 grid gap-3">
                  {items.map((item) => (
                    <div key={item.productId} className="grid gap-2 border-b border-zinc-100 pb-3 last:border-b-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-zinc-950">{item.name}</p>
                        <button
                          type="button"
                          onClick={() => removeItem(item.productId)}
                          aria-label={`Remove ${item.name}`}
                          className="focus-ring text-zinc-400 hover:text-rose-700"
                        >
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm text-zinc-600">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(event) => updateQuantity(item.productId, Number(event.target.value))}
                          className="focus-ring min-h-9 w-20 rounded-md border border-zinc-300 px-2"
                        />
                        <span>{money(item.unitPriceCents * item.quantity)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex justify-between border-t border-zinc-100 pt-3 text-sm font-semibold text-zinc-950">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>

              {submitError ? <p className="mt-3 text-sm text-rose-700">{submitError}</p> : null}

              <button
                type="submit"
                disabled={submitStatus === "submitting" || !email.trim() || items.length === 0}
                className="focus-ring mt-4 min-h-11 w-full rounded-md bg-zinc-950 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
              >
                {submitStatus === "submitting" ? "Creating..." : "Create order"}
              </button>
            </section>
          </div>
        </form>
      </main>
    </RequireAdminAuth>
  );
}
