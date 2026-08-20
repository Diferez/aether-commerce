"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { RequireAdminAuth } from "./RequireAdminAuth";
import { ProductForm, emptyProductForm, type ProductFormValues } from "./ProductForm";
import { useAdminConfig } from "./AetherAdminProvider";
import { PageHeader } from "./PageHeader";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { useAdminLanguage } from "./AdminLanguageProvider";
import type { AdminDictionary } from "@aether/i18n";

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

function pageBody(
  state: "loading" | "ready" | "not-found" | "error",
  id: string | null,
  initialValues: ProductFormValues,
  t: AdminDictionary
): ReactNode {
  if (state === "loading") {
    return (
      <div className="grid gap-3">
        <div className="skeleton h-8 w-64 rounded" />
        <div className="skeleton h-40 rounded-lg" />
      </div>
    );
  }
  if (state === "not-found") {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <EmptyState title={t.editProductPage.productNotFoundTitle} description={t.editProductPage.productNotFoundDescription} />
      </div>
    );
  }
  if (state === "error") return <ErrorState title={t.editProductPage.couldNotLoadProduct} />;
  return (
    <>
      <PageHeader
        title={initialValues.name}
        description={t.editProductPage.skuLabel.replace("{sku}", initialValues.sku)}
        breadcrumb={[{ label: t.editProductPage.productsBreadcrumb, href: "/products/" }]}
      />
      <ProductForm mode="edit" productId={id ?? undefined} initialValues={initialValues} />
    </>
  );
}

export function ProductsEditPage() {
  const id = useProductIdParam();
  const { getToken, isLoaded: authLoaded } = useAuth();
  const { apiBaseUrl } = useAdminConfig();
  const { t } = useAdminLanguage();
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
  }, [id, authLoaded, getToken, apiBaseUrl]);

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        {pageBody(state, id, initialValues, t)}
      </main>
    </RequireAdminAuth>
  );
}
