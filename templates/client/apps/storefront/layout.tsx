import type { Metadata } from "next";
import "./globals.css";
import {
  AetherAuthProvider,
  AetherStorefrontProvider,
  AssistantWidget,
  CartProvider,
  CompareProvider,
  CookieNotice,
  FavoritesProvider,
  FloatingCart,
  LanguageProvider,
  SiteFooter,
  SiteHeader,
  WhatsappBubble
} from "@aether/storefront-default";
import { themeTokensToCssVariables } from "@aether/ui/theme";
import { clientConfiguration } from "../../src/configuration.js";
import { legalPolicyVersion } from "../../config/legal.js";

export const metadata: Metadata = {
  title: clientConfiguration.brand.name,
  description: `${clientConfiguration.brand.name} storefront.`
};

const themeInitScript = `
(function () {
  try {
    if (window.localStorage.getItem("theme.v1") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }

    var storedLocale = window.localStorage.getItem("locale.v1");
    var locale = storedLocale === "en" || storedLocale === "es"
      ? storedLocale
      : (navigator.language || "").toLowerCase().indexOf("es") === 0 ? "es" : "en";
    if (locale !== "en") {
      document.documentElement.setAttribute("data-locale-pending", "1");
    }
  } catch (e) {}
})();
`;

/**
 * Wire this into your Next.js project's real app/layout.tsx - or copy it
 * there directly, since this file already is one. apiBaseUrl/aiAssistantUrl
 * resolution (env vars, hostname sniffing, ...) is deliberately your app's
 * own concern, not the package's - it differs per deployment. Using
 * productionBaseUrl unconditionally here is illustrative; a real app
 * typically branches on environment the way apps/storefront's own
 * reference layout does. FavoritesProvider's customerId is null (guest-
 * only) until you wire up your own auth the way AetherAuthProvider's
 * useAetherAuth() below expects.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <style>{themeTokensToCssVariables(clientConfiguration.theme)}</style>
        <style>{`html[data-locale-pending] body { visibility: hidden; }`}</style>
      </head>
      <body>
        {/* AI assistant Worker URL isn't part of clientConfiguration (it's a
            separate deployment, config/agent.ts only names which env var
            holds it) - NEXT_PUBLIC_* vars must be referenced statically like
            this for Next.js's build-time inlining to see them. Unset means
            AssistantWidget renders nothing, same as this repo's own
            apps/storefront/components/config.ts resolution. */}
        <AetherStorefrontProvider
          config={clientConfiguration}
          apiBaseUrl={clientConfiguration.integrations.api.productionBaseUrl}
          aiAssistantUrl={process.env.NEXT_PUBLIC_AETHER_AI_URL}
        >
          <AetherAuthProvider>
            <CartProvider>
              <FavoritesProvider customerId={null}>
                <CompareProvider>
                  <LanguageProvider>
                    <SiteHeader />
                    {children}
                    <SiteFooter />
                    <CookieNotice />
                    <AssistantWidget legalPolicyVersion={legalPolicyVersion} />
                    <WhatsappBubble />
                    <FloatingCart />
                  </LanguageProvider>
                </CompareProvider>
              </FavoritesProvider>
            </CartProvider>
          </AetherAuthProvider>
        </AetherStorefrontProvider>
      </body>
    </html>
  );
}
