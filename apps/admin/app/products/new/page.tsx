"use client";

import { RequireAdminAuth } from "../../../components/RequireAdminAuth";
import { ProductForm, emptyProductForm } from "../../../components/ProductForm";
import { PageHeader } from "../../../components/PageHeader";
import { useAdminLanguage } from "../../../components/AdminLanguageProvider";

export default function NewProductPage() {
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
