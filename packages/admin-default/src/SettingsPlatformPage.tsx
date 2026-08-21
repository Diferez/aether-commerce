"use client";

import { RequireAdminAuth } from "./RequireAdminAuth";
import { PageHeader } from "./PageHeader";
import { useAdminLanguage } from "./AdminLanguageProvider";
import { PlatformSettingsPage } from "./PlatformSettingsPage";

export function SettingsPlatformPage() {
  const { t } = useAdminLanguage();

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader title={t.platformPage.title} description={t.platformPage.description} />
        <PlatformSettingsPage />
      </main>
    </RequireAdminAuth>
  );
}
