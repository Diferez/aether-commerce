"use client";

import { RequireAdminAuth } from "./RequireAdminAuth";
import { PageHeader } from "./PageHeader";
import { useAdminLanguage } from "./AdminLanguageProvider";
import { CheckoutProviderSettings } from "./CheckoutProviderSettings";
import { IntegrationSecretsSettings } from "./IntegrationSecretsSettings";

export function SettingsIntegrationsPage() {
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
