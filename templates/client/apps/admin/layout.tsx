import type { ReactNode } from "react";
import { AdminLanguageProvider, AetherAdminProvider } from "@aether/admin-default";
import { clientConfiguration } from "../../src/configuration.js";

/**
 * Wire this into your Next.js admin project's real app/layout.tsx - see
 * apps/storefront/layout.tsx's comment for why apiBaseUrl resolution stays
 * app-owned rather than baked into the package.
 */
export function ClientAdminLayout({ children }: { children: ReactNode }) {
  return (
    <AetherAdminProvider config={clientConfiguration} apiBaseUrl={clientConfiguration.integrations.api.productionBaseUrl}>
      <AdminLanguageProvider>{children}</AdminLanguageProvider>
    </AetherAdminProvider>
  );
}
