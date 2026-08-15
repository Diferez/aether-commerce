"use client";

import { RequireAdminAuth } from "../../../components/RequireAdminAuth";
import { ProductForm, emptyProductForm } from "../../../components/ProductForm";
import { PageHeader } from "../../../components/PageHeader";

export default function NewProductPage() {
  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader
          title="New product"
          description="Starts as a draft - publish it once it looks right."
          breadcrumb={[{ label: "Products", href: "/products/" }]}
        />
        <ProductForm mode="create" initialValues={emptyProductForm} />
      </main>
    </RequireAdminAuth>
  );
}
