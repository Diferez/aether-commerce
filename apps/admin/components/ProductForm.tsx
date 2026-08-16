"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/react";
import { AlertTriangle, GripVertical, ImagePlus, Loader2, Star, Trash2, X } from "lucide-react";
import { apiBaseUrl } from "./config";
import { FormSection } from "./FormSection";
import { StickyFormActions } from "./StickyFormActions";
import { ConfirmDialog } from "./ConfirmDialog";
import { useAdminLanguage } from "./AdminLanguageProvider";

export type ProductFormValues = {
  name: string;
  slug: string;
  sku: string;
  brand: string;
  category: string;
  subcategory: string;
  shortDescription: string;
  description: string;
  tags: string;
  highlights: string;
  images: { main: string; gallery: string[] };
  seoTitle: string;
  seoDescription: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  stock: number;
  lowStockThreshold: number;
  visibility: "draft" | "visible" | "hidden";
  featured: boolean;
  isNew: boolean;
  isDeal: boolean;
};

export const emptyProductForm: ProductFormValues = {
  name: "",
  slug: "",
  sku: "",
  brand: "",
  category: "",
  subcategory: "",
  shortDescription: "",
  description: "",
  tags: "",
  highlights: "",
  images: { main: "", gallery: [] },
  seoTitle: "",
  seoDescription: "",
  priceCents: 0,
  compareAtPriceCents: null,
  stock: 0,
  lowStockThreshold: 4,
  visibility: "draft",
  featured: false,
  isNew: false,
  isDeal: false
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const inputClass =
  "focus-ring min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-50";
const labelClass = "grid gap-1 text-sm";
const labelTextClass = "font-medium text-ink-muted";

function centsToInput(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

function inputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

export function ProductForm({
  mode,
  productId,
  initialValues,
  onSaved
}: {
  mode: "create" | "edit";
  productId?: string | undefined;
  initialValues: ProductFormValues;
  onSaved?: ((id: string) => void) | undefined;
}) {
  const router = useRouter();
  const { getToken } = useAuth();
  const { t } = useAdminLanguage();
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function buildPayload() {
    return {
      name: values.name.trim(),
      slug: values.slug.trim() || undefined,
      sku: values.sku.trim() || undefined,
      brand: values.brand.trim() || null,
      category: values.category.trim(),
      subcategory: values.subcategory.trim() || null,
      shortDescription: values.shortDescription.trim(),
      description: values.description.trim(),
      tags: values.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      highlights: values.highlights
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      images: values.images,
      seoTitle: values.seoTitle.trim() || undefined,
      seoDescription: values.seoDescription.trim() || undefined,
      priceCents: values.priceCents,
      compareAtPriceCents: values.compareAtPriceCents,
      stock: values.stock,
      lowStockThreshold: values.lowStockThreshold,
      visibility: values.visibility,
      featured: values.featured,
      isNew: values.isNew,
      isDeal: values.isDeal
    };
  }

  async function authorizedFetch(path: string, init: RequestInit) {
    const token = await getToken().catch(() => null);
    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers
      }
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setErrorMessage(null);

    if (!values.name.trim() || !values.category.trim() || !values.shortDescription.trim() || !values.description.trim()) {
      setStatus("error");
      setErrorMessage(t.productForm.requiredFieldsMissing);
      return;
    }
    if (!values.images.main) {
      setStatus("error");
      setErrorMessage(t.productForm.mainImageRequired);
      return;
    }
    if (values.compareAtPriceCents != null && values.compareAtPriceCents <= values.priceCents) {
      setStatus("error");
      setErrorMessage(t.productForm.compareAtPriceTooLow);
      return;
    }

    try {
      const response = await authorizedFetch(
        mode === "create" ? "/api/v1/admin/products" : `/api/v1/admin/products/${productId}`,
        { method: mode === "create" ? "POST" : "PATCH", body: JSON.stringify(buildPayload()) }
      );
      const payload = (await response.json()) as { success: boolean; data?: { id: string }; error?: { message: string } };
      if (!payload.success) {
        setStatus("error");
        setErrorMessage(payload.error?.message ?? t.productForm.couldNotSaveProduct);
        return;
      }
      setStatus("saved");
      const id = payload.data?.id ?? productId;
      if (id) onSaved?.(id);
      if (mode === "create" && id) {
        router.push(`/products/edit/?id=${encodeURIComponent(id)}`);
      }
    } catch {
      setStatus("error");
      setErrorMessage(t.productForm.networkErrorProductNotSaved);
    }
  }

  async function handleFileSelected(file: File) {
    setUploading(true);
    setErrorMessage(null);
    try {
      const sigResponse = await authorizedFetch("/api/v1/admin/uploads/signature", { method: "POST" });
      const sigPayload = (await sigResponse.json()) as {
        success: boolean;
        data?: { cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string };
        error?: { message: string };
      };
      if (!sigPayload.success || !sigPayload.data) {
        setErrorMessage(sigPayload.error?.message ?? t.productForm.imageUploadsNotConfigured);
        return;
      }
      const { cloudName, apiKey, timestamp, folder, signature } = sigPayload.data;
      const form = new FormData();
      form.set("file", file);
      form.set("api_key", apiKey);
      form.set("timestamp", String(timestamp));
      form.set("folder", folder);
      form.set("signature", signature);
      const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: form
      });
      const uploadPayload = (await uploadResponse.json()) as { secure_url?: string; error?: { message?: string } };
      if (!uploadResponse.ok || !uploadPayload.secure_url) {
        setErrorMessage(uploadPayload.error?.message ?? t.productForm.imageUploadFailed);
        return;
      }
      setValues((current) =>
        current.images.main
          ? { ...current, images: { ...current.images, gallery: [...current.images.gallery, uploadPayload.secure_url as string] } }
          : { ...current, images: { main: uploadPayload.secure_url as string, gallery: current.images.gallery } }
      );
    } catch {
      setErrorMessage(t.productForm.networkErrorImageNotUploaded);
    } finally {
      setUploading(false);
    }
  }

  function removeImage(url: string) {
    setValues((current) => {
      if (current.images.main === url) {
        const [nextMain, ...rest] = current.images.gallery;
        return { ...current, images: { main: nextMain ?? "", gallery: rest } };
      }
      return { ...current, images: { ...current.images, gallery: current.images.gallery.filter((item) => item !== url) } };
    });
  }

  function makeMainImage(url: string) {
    setValues((current) => ({
      ...current,
      images: {
        main: url,
        gallery: [current.images.main, ...current.images.gallery].filter((item) => item && item !== url)
      }
    }));
  }

  async function handleDelete() {
    if (!productId) return;
    setDeleting(true);
    try {
      const response = await authorizedFetch(`/api/v1/admin/products/${productId}`, { method: "DELETE" });
      const payload = (await response.json()) as { success: boolean; data?: { deleted: boolean; softDeleted: boolean } };
      if (!payload.success) {
        setErrorMessage(t.productForm.couldNotDeleteProduct);
        return;
      }
      router.push("/products/");
    } catch {
      setErrorMessage(t.productForm.networkErrorProductNotDeleted);
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const allImages = [values.images.main, ...values.images.gallery].filter(Boolean);

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-6 pb-16">
      {errorMessage ? (
        <div className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{errorMessage}</p>
        </div>
      ) : null}

      <FormSection title={t.productForm.basicInfoSection}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.nameLabel}</span>
            <input required className={inputClass} value={values.name} onChange={(event) => set("name", event.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.slugLabel}</span>
            <input
              className={inputClass}
              value={values.slug}
              placeholder={t.productForm.slugPlaceholder}
              onChange={(event) => set("slug", event.target.value)}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.categoryLabel}</span>
            <input required className={inputClass} value={values.category} onChange={(event) => set("category", event.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.subcategoryLabel}</span>
            <input className={inputClass} value={values.subcategory} onChange={(event) => set("subcategory", event.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.brandLabel}</span>
            <input className={inputClass} value={values.brand} onChange={(event) => set("brand", event.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.statusLabel}</span>
            <select
              className={inputClass}
              value={values.visibility}
              onChange={(event) => set("visibility", event.target.value as ProductFormValues["visibility"])}
            >
              <option value="draft">{t.productsPage.statusDraft}</option>
              <option value="visible">{t.productsPage.statusPublished}</option>
              <option value="hidden">{t.productsPage.statusArchived}</option>
            </select>
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            <span className={labelTextClass}>{t.productForm.shortDescriptionLabel}</span>
            <input
              required
              maxLength={300}
              className={inputClass}
              value={values.shortDescription}
              onChange={(event) => set("shortDescription", event.target.value)}
            />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            <span className={labelTextClass}>{t.productForm.descriptionLabel}</span>
            <textarea
              required
              rows={5}
              className={`${inputClass} min-h-24`}
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.tagsLabel}</span>
            <input className={inputClass} value={values.tags} onChange={(event) => set("tags", event.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.highlightsLabel}</span>
            <input className={inputClass} value={values.highlights} onChange={(event) => set("highlights", event.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={values.featured} onChange={(event) => set("featured", event.target.checked)} />
              {t.productForm.featured}
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={values.isNew} onChange={(event) => set("isNew", event.target.checked)} />
              {t.productForm.newArrival}
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={values.isDeal} onChange={(event) => set("isDeal", event.target.checked)} />
              {t.productForm.onSale}
            </label>
          </div>
        </div>
      </FormSection>

      <FormSection title={t.productForm.priceSection}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.priceLabel}</span>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={centsToInput(values.priceCents)}
              onChange={(event) => set("priceCents", inputToCents(event.target.value) ?? 0)}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.compareAtPriceLabel}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={centsToInput(values.compareAtPriceCents)}
              onChange={(event) => set("compareAtPriceCents", inputToCents(event.target.value))}
            />
            <span className="text-xs text-ink-subtle">{t.productForm.compareAtPriceHint}</span>
          </label>
        </div>
      </FormSection>

      <FormSection title={t.productForm.inventorySection}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.skuLabel}</span>
            <input className={inputClass} value={values.sku} placeholder={t.productForm.skuPlaceholder} onChange={(event) => set("sku", event.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.stockLabel}</span>
            <input
              required
              type="number"
              min="0"
              className={inputClass}
              value={values.stock}
              onChange={(event) => set("stock", Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.lowStockThresholdLabel}</span>
            <input
              type="number"
              min="0"
              className={inputClass}
              value={values.lowStockThreshold}
              onChange={(event) => set("lowStockThreshold", Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
        </div>
      </FormSection>

      <FormSection title={t.productForm.imagesSection} description={t.productForm.imagesDescription}>
        <div className="flex flex-wrap gap-3">
          {allImages.map((url) => (
            <div key={url} className="group relative h-24 w-24 overflow-hidden rounded-md border border-border">
              {/* Plain <img>, not next/image - admin-managed, arbitrary remote URLs */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              {url === values.images.main ? (
                <span className="absolute left-1 top-1 rounded bg-ink/80 p-1 text-surface">
                  <Star size={11} aria-hidden />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => makeMainImage(url)}
                  className="focus-ring absolute left-1 top-1 rounded bg-ink/70 p-1 text-surface opacity-0 group-hover:opacity-100"
                  aria-label={t.productForm.makeMainImage}
                >
                  <Star size={11} aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeImage(url)}
                className="focus-ring absolute right-1 top-1 rounded bg-ink/70 p-1 text-surface opacity-0 group-hover:opacity-100"
                aria-label={t.productForm.removeImage}
              >
                <X size={11} aria-hidden />
              </button>
              <span className="absolute bottom-1 right-1 text-ink-subtle opacity-0 group-hover:opacity-100" aria-hidden>
                <GripVertical size={12} />
              </span>
            </div>
          ))}
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="focus-ring grid h-24 w-24 place-items-center gap-1 rounded-md border-2 border-dashed border-border-strong text-xs font-medium text-ink-muted hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ImagePlus size={18} aria-hidden />}
            {uploading ? t.productForm.uploading : t.productForm.addImage}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFileSelected(file);
              event.target.value = "";
            }}
          />
        </div>
      </FormSection>

      <FormSection title={t.productForm.seoSection}>
        <div className="grid gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.seoTitleLabel}</span>
            <input
              maxLength={160}
              className={inputClass}
              placeholder={values.name ? `${values.name} | Aether` : ""}
              value={values.seoTitle}
              onChange={(event) => set("seoTitle", event.target.value)}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>{t.productForm.seoDescriptionLabel}</span>
            <input
              maxLength={300}
              className={inputClass}
              placeholder={values.shortDescription.slice(0, 150)}
              value={values.seoDescription}
              onChange={(event) => set("seoDescription", event.target.value)}
            />
          </label>
          <p className="text-xs text-ink-subtle">
            {t.productForm.previewLabel} <span className="font-medium text-ink-muted">{values.seoTitle || (values.name ? `${values.name} | Aether` : "...")}</span>
            {" - "}
            /products/{values.slug || "..."}
          </p>
        </div>
      </FormSection>

      <StickyFormActions>
        <button
          type="submit"
          disabled={status === "saving"}
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "saving" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
          {mode === "create" ? t.productsPage.createProduct : t.productForm.saveChanges}
        </button>
        {status === "saved" ? <span className="text-sm text-success">{t.productForm.saved}</span> : null}

        {mode === "edit" ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="focus-ring ml-auto inline-flex min-h-11 items-center gap-2 rounded-md border border-danger/30 px-3 text-sm font-semibold text-danger hover:bg-danger-soft"
          >
            <Trash2 size={15} aria-hidden />
            {t.common.delete}
          </button>
        ) : null}
      </StickyFormActions>

      <ConfirmDialog
        open={confirmingDelete}
        title={t.productForm.deleteThisProductTitle}
        description={t.productForm.deleteThisProductDescription}
        confirmLabel={t.productForm.confirmDelete}
        tone="danger"
        pending={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </form>
  );
}
