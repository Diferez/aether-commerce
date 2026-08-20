import type { Metadata } from "next";
import "./globals.css";
import { AetherAuthProvider, AetherStorefrontProvider } from "@aether/storefront-default";
import { AppProviders } from "../components/AppProviders";
import { LanguageProvider } from "../components/LanguageProvider";
import { FloatingCart } from "../components/FloatingCart";
import { SiteHeader } from "../components/SiteHeader";
import { AssistantWidget } from "../components/AssistantWidget";
import { themeTokensToCssVariables } from "@aether/ui/theme";
import { aetherClientConfiguration, aetherThemeTokens } from "../../../config/aether";
import { apiBaseUrl, storefrontBasePath } from "../components/config";
import { WhatsappBubble } from "../components/WhatsappBubble";
import { CookieNotice } from "../components/CookieNotice";
import { SiteFooter } from "../components/SiteFooter";
import { SentryProvider } from "../components/SentryProvider";

export const metadata: Metadata = {
  title: "Aether | Premium Commerce Demo",
  description: "A bilingual premium technology commerce demo powered by a Cloudflare Worker API.",
  metadataBase: new URL("https://aether-storefront.pickofwow.workers.dev"),
  openGraph: {
    title: "Aether Premium Commerce Demo",
    description: "Premium technology shopping demo with static storefront and Worker API.",
    type: "website"
  }
};

const themeInitScript = `
(function () {
  try {
    if (window.localStorage.getItem("aether.theme.v1") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }

    var storedLocale = window.localStorage.getItem("aether.locale");
    var locale = storedLocale === "en" || storedLocale === "es"
      ? storedLocale
      : (navigator.language || "").toLowerCase().indexOf("es") === 0 ? "es" : "en";
    if (locale !== "en") {
      document.documentElement.setAttribute("data-locale-pending", "1");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <style>{themeTokensToCssVariables(aetherThemeTokens)}</style>
        <style>{`html[data-locale-pending] body { visibility: hidden; }`}</style>
      </head>
      <body>
        <SentryProvider>
          <AetherStorefrontProvider config={aetherClientConfiguration} apiBaseUrl={apiBaseUrl} basePath={storefrontBasePath}>
            <AetherAuthProvider>
              <AppProviders>
                <LanguageProvider>
                  <SiteHeader />
                  {children}
                  <SiteFooter />
                  <CookieNotice />
                  <AssistantWidget />
                  <WhatsappBubble />
                  <FloatingCart />
                </LanguageProvider>
              </AppProviders>
            </AetherAuthProvider>
          </AetherStorefrontProvider>
        </SentryProvider>
      </body>
    </html>
  );
}
