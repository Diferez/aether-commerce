"use client";

import { RequireAdminAuth } from "./RequireAdminAuth";
import { ProductForm, emptyProductForm } from "./ProductForm";
import { PageHeader } from "./PageHeader";
import { useAdminLanguage } from "./AdminLanguageProvider";

export function ProductsNewPage() {
  const { t } = useAdminLanguage();
  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader
          title={t.newProductPage.title}
          description={t.newProductPage.description}
          breadcrumb={[{ label: t.newProductPage.productsBreadcrumb, href: "/products/" }]}
        />
        <ProductForm mode="create" initialValues={emptyProductForm} />
      </main>
    </RequireAdminAuth>
  );
}
