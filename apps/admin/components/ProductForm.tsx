"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/react";
import { AlertTriangle, GripVertical, ImagePlus, Loader2, Star, Trash2, X } from "lucide-react";
import { apiBaseUrl } from "./config";

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
  "focus-ring min-h-11 w-full rounded-md border border-zinc-300 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50";
const labelClass = "grid gap-1 text-sm";
const labelTextClass = "font-medium text-zinc-700";

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
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
      setErrorMessage("Name, category, short description and description are required.");
      return;
    }
    if (!values.images.main) {
      setStatus("error");
      setErrorMessage("Add at least a main image before saving.");
      return;
    }
    if (values.compareAtPriceCents != null && values.compareAtPriceCents <= values.priceCents) {
      setStatus("error");
      setErrorMessage("The compare-at price must be higher than the current price.");
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
        setErrorMessage(payload.error?.message ?? "Could not save the product.");
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
      setErrorMessage("Network error - the product was not saved.");
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
        setErrorMessage(sigPayload.error?.message ?? "Image uploads are not configured.");
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
        setErrorMessage(uploadPayload.error?.message ?? "The image upload failed.");
        return;
      }
      setValues((current) =>
        current.images.main
          ? { ...current, images: { ...current.images, gallery: [...current.images.gallery, uploadPayload.secure_url as string] } }
          : { ...current, images: { main: uploadPayload.secure_url as string, gallery: current.images.gallery } }
      );
    } catch {
      setErrorMessage("Network error - the image was not uploaded.");
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
    setStatus("saving");
    try {
      const response = await authorizedFetch(`/api/v1/admin/products/${productId}`, { method: "DELETE" });
      const payload = (await response.json()) as { success: boolean; data?: { deleted: boolean; softDeleted: boolean } };
      if (!payload.success) {
        setStatus("error");
        setErrorMessage("Could not delete the product.");
        return;
      }
      router.push("/products/");
    } catch {
      setStatus("error");
      setErrorMessage("Network error - the product was not deleted.");
    }
  }

  const allImages = [values.images.main, ...values.images.gallery].filter(Boolean);

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-6 pb-16">
      {errorMessage ? (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{errorMessage}</p>
        </div>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold">Basic information</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            <span className={labelTextClass}>Name *</span>
            <input required className={inputClass} value={values.name} onChange={(event) => set("name", event.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Slug</span>
            <input
              className={inputClass}
              value={values.slug}
              placeholder="auto-generated from name if empty"
              onChange={(event) => set("slug", event.target.value)}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Category *</span>
            <input required className={inputClass} value={values.category} onChange={(event) => set("category", event.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Subcategory</span>
            <input className={inputClass} value={values.subcategory} onChange={(event) => set("subcategory", event.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Brand</span>
            <input className={inputClass} value={values.brand} onChange={(event) => set("brand", event.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Status</span>
            <select
              className={inputClass}
              value={values.visibility}
              onChange={(event) => set("visibility", event.target.value as ProductFormValues["visibility"])}
            >
              <option value="draft">Draft</option>
              <option value="visible">Published</option>
              <option value="hidden">Archived</option>
            </select>
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            <span className={labelTextClass}>Short description *</span>
            <input
              required
              maxLength={300}
              className={inputClass}
              value={values.shortDescription}
              onChange={(event) => set("shortDescription", event.target.value)}
            />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            <span className={labelTextClass}>Description *</span>
            <textarea
              required
              rows={5}
              className={`${inputClass} min-h-24`}
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Tags (comma separated)</span>
            <input className={inputClass} value={values.tags} onChange={(event) => set("tags", event.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Highlights (one per line)</span>
            <input className={inputClass} value={values.highlights} onChange={(event) => set("highlights", event.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={values.featured} onChange={(event) => set("featured", event.target.checked)} />
              Featured
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={values.isNew} onChange={(event) => set("isNew", event.target.checked)} />
              New arrival
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={values.isDeal} onChange={(event) => set("isDeal", event.target.checked)} />
              On sale
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold">Price</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            <span className={labelTextClass}>Price (USD) *</span>
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
            <span className={labelTextClass}>Compare-at price (optional)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={centsToInput(values.compareAtPriceCents)}
              onChange={(event) => set("compareAtPriceCents", inputToCents(event.target.value))}
            />
            <span className="text-xs text-zinc-500">Must be higher than the price - shown struck through.</span>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold">Inventory</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className={labelClass}>
            <span className={labelTextClass}>SKU</span>
            <input className={inputClass} value={values.sku} placeholder="auto-generated if empty" onChange={(event) => set("sku", event.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Stock *</span>
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
            <span className={labelTextClass}>Low stock threshold</span>
            <input
              type="number"
              min="0"
              className={inputClass}
              value={values.lowStockThreshold}
              onChange={(event) => set("lowStockThreshold", Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold">Images</h2>
        <p className="mt-1 text-sm text-zinc-500">The first image is the main image shown in the catalog.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {allImages.map((url) => (
            <div key={url} className="group relative h-24 w-24 overflow-hidden rounded-md border border-zinc-200">
              {/* Plain <img>, not next/image - admin-managed, arbitrary remote URLs */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              {url === values.images.main ? (
                <span className="absolute left-1 top-1 rounded bg-zinc-950/80 p-1 text-white">
                  <Star size={11} aria-hidden />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => makeMainImage(url)}
                  className="focus-ring absolute left-1 top-1 rounded bg-zinc-950/70 p-1 text-white opacity-0 group-hover:opacity-100"
                  aria-label="Make main image"
                >
                  <Star size={11} aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeImage(url)}
                className="focus-ring absolute right-1 top-1 rounded bg-zinc-950/70 p-1 text-white opacity-0 group-hover:opacity-100"
                aria-label="Remove image"
              >
                <X size={11} aria-hidden />
              </button>
              <span className="absolute bottom-1 right-1 text-zinc-300 opacity-0 group-hover:opacity-100" aria-hidden>
                <GripVertical size={12} />
              </span>
            </div>
          ))}
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="focus-ring grid h-24 w-24 place-items-center gap-1 rounded-md border-2 border-dashed border-zinc-300 text-xs font-medium text-zinc-500 hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ImagePlus size={18} aria-hidden />}
            {uploading ? "Uploading..." : "Add image"}
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
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold">SEO</h2>
        <div className="mt-4 grid gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>SEO title</span>
            <input
              maxLength={160}
              className={inputClass}
              placeholder={values.name ? `${values.name} | Aether` : ""}
              value={values.seoTitle}
              onChange={(event) => set("seoTitle", event.target.value)}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>SEO description</span>
            <input
              maxLength={300}
              className={inputClass}
              placeholder={values.shortDescription.slice(0, 150)}
              value={values.seoDescription}
              onChange={(event) => set("seoDescription", event.target.value)}
            />
          </label>
          <p className="text-xs text-zinc-500">
            Preview: <span className="font-medium text-zinc-700">{values.seoTitle || (values.name ? `${values.name} | Aether` : "...")}</span>
            {" - "}
            /products/{values.slug || "..."}
          </p>
        </div>
      </section>

      <div className="sticky bottom-0 flex items-center gap-3 border-t border-zinc-200 bg-white/95 p-4 backdrop-blur">
        <button
          type="submit"
          disabled={status === "saving"}
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "saving" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
          {mode === "create" ? "Create product" : "Save changes"}
        </button>
        {status === "saved" ? <span className="text-sm text-teal-700">Saved.</span> : null}

        {mode === "edit" ? (
          <div className="ml-auto">
            {confirmingDelete ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-600">Delete this product?</span>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  className="focus-ring rounded-md bg-rose-600 px-3 py-2 font-semibold text-white"
                >
                  Confirm delete
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="focus-ring rounded-md border border-zinc-300 px-3 py-2 font-semibold">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md border border-rose-300 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"
              >
                <Trash2 size={15} aria-hidden />
                Delete
              </button>
            )}
          </div>
        ) : null}
      </div>
    </form>
  );
}
