"use client";

import { ArrowLeft } from "lucide-react";
import { RequireAdminAuth } from "../../../components/RequireAdminAuth";
import { ProductForm, emptyProductForm } from "../../../components/ProductForm";

export default function NewProductPage() {
  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <a href="/products/" className="focus-ring mb-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950">
          <ArrowLeft size={15} aria-hidden />
          Products
        </a>
        <h1 className="text-2xl font-semibold text-zinc-950">New product</h1>
        <p className="mt-1 text-sm text-zinc-500">Starts as a draft - publish it once it looks right.</p>
        <div className="mt-6">
          <ProductForm mode="create" initialValues={emptyProductForm} />
        </div>
      </main>
    </RequireAdminAuth>
  );
}
