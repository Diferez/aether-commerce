"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@clerk/react";
import { RequireAdminAuth } from "../../../components/RequireAdminAuth";
import { ProductForm, emptyProductForm, type ProductFormValues } from "../../../components/ProductForm";
import { apiBaseUrl } from "../../../components/config";

// admin/next.config.mjs sets output: "export" (static, deployed to Cloudflare
// Pages) - a dynamic [id] route segment can't work here since product ids
// are created at runtime, unknowable at build time. Reading ?id= from
// window.location.search instead of next/navigation's useSearchParams()
// mirrors the same workaround the storefront already uses for this exact
// static-export constraint (see SiteHeader.tsx's useQueryParam).
function useProductIdParam(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id"));
  }, []);
  return id;
}

type ProductDetailResponse = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  final_price_cents: number;
  stock: number;
  low_stock_threshold: number;
  visibility: "draft" | "visible" | "hidden";
  featured: number;
  is_new: number;
  is_deal: number;
  details: {
    shortDescription: string;
    description: string;
    highlights: string[];
    tags: string[];
    images: { main: string; gallery: string[] };
    seoTitle?: string;
    seoDescription?: string;
  };
};

function toFormValues(row: ProductDetailResponse): ProductFormValues {
  return {
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    brand: row.brand ?? "",
    category: row.category,
    subcategory: row.subcategory ?? "",
    shortDescription: row.details.shortDescription,
    description: row.details.description,
    tags: row.details.tags.join(", "),
    highlights: row.details.highlights.join("\n"),
    images: row.details.images,
    seoTitle: row.details.seoTitle ?? "",
    seoDescription: row.details.seoDescription ?? "",
    priceCents: row.final_price_cents,
    compareAtPriceCents: row.compare_at_price_cents,
    stock: row.stock,
    lowStockThreshold: row.low_stock_threshold,
    visibility: row.visibility,
    featured: Boolean(row.featured),
    isNew: Boolean(row.is_new),
    isDeal: Boolean(row.is_deal)
  };
}

export default function EditProductPage() {
  const id = useProductIdParam();
  const { getToken, isLoaded: authLoaded } = useAuth();
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [initialValues, setInitialValues] = useState<ProductFormValues>(emptyProductForm);

  useEffect(() => {
    if (id === null || !authLoaded) return;
    if (!id) {
      setState("not-found");
      return;
    }
    let cancelled = false;
    void (async () => {
      const token = await getToken().catch(() => null);
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/admin/products/${encodeURIComponent(id)}`, {
          headers: token ? { authorization: `Bearer ${token}` } : {}
        });
        if (cancelled) return;
        if (response.status === 404) {
          setState("not-found");
          return;
        }
        const payload = (await response.json()) as { success: boolean; data?: ProductDetailResponse };
        if (!payload.success || !payload.data) {
          setState("error");
          return;
        }
        setInitialValues(toFormValues(payload.data));
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, authLoaded, getToken]);

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <a href="/products/" className="focus-ring mb-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950">
          <ArrowLeft size={15} aria-hidden />
          Products
        </a>

        {state === "loading" ? (
          <div className="grid gap-3">
            <div className="h-8 w-64 animate-pulse rounded bg-zinc-200" />
            <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />
          </div>
        ) : state === "not-found" ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center">
            <p className="font-semibold text-zinc-950">Product not found</p>
            <p className="mt-1 text-sm text-zinc-500">It may have been deleted, or the link is incorrect.</p>
          </div>
        ) : state === "error" ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-rose-800">
            Could not load this product. Try again in a moment.
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-zinc-950">{initialValues.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">SKU {initialValues.sku}</p>
            <div className="mt-6">
              <ProductForm mode="edit" productId={id ?? undefined} initialValues={initialValues} />
            </div>
          </>
        )}
      </main>
    </RequireAdminAuth>
  );
}
