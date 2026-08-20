"use client";

import { RequireAdminAuth } from "../../../components/RequireAdminAuth";
import { PageHeader } from "../../../components/PageHeader";
import { useAdminLanguage } from "../../../components/AdminLanguageProvider";
import { CheckoutProviderSettings } from "../../../components/CheckoutProviderSettings";
import { IntegrationSecretsSettings } from "../../../components/IntegrationSecretsSettings";

export default function IntegrationsSettingsPage() {
  const { t } = useAdminLanguage();

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader title={t.integrationsPage.title} description={t.integrationsPage.description} />
        <CheckoutProviderSettings />
        <IntegrationSecretsSettings />
      </main>
    </RequireAdminAuth>
  );
}
