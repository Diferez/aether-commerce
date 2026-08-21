import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AdminLanguageProvider, AetherAdminProvider } from "@aether/admin-default";
import { AdminShell } from "../components/AdminShell";
import { ClerkAuthProvider } from "../components/ClerkAuthProvider";
import { clientConfiguration } from "../../../src/configuration";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
  display: "swap"
});

export const metadata: Metadata = {
  title: `${clientConfiguration.brand.name} Admin`,
  description: `Store administration for ${clientConfiguration.brand.name}.`
};

const themeInitScript = `
(function () {
  try {
    if (window.localStorage.getItem("admin.theme.v1") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }

    var storedLocale = window.localStorage.getItem("admin.locale.v1");
    var locale = storedLocale === "en" || storedLocale === "es"
      ? storedLocale
      : (navigator.language || "").toLowerCase().indexOf("es") === 0 ? "es" : "en";
    if (locale !== "en") {
      document.documentElement.setAttribute("data-locale-pending", "1");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <style>{`html[data-locale-pending] body { visibility: hidden; } :root { --color-accent: ${clientConfiguration.theme.primary}; }`}</style>
      </head>
      <body>
        <a
          href="#main-content"
          className="focus:bg-accent sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <AetherAdminProvider config={clientConfiguration} apiBaseUrl={clientConfiguration.integrations.api.productionBaseUrl}>
          <ClerkAuthProvider>
            <AdminLanguageProvider>
              <AdminShell>{children}</AdminShell>
            </AdminLanguageProvider>
          </ClerkAuthProvider>
        </AetherAdminProvider>
      </body>
    </html>
  );
}
