import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AdminShell } from "../components/AdminShell";
import { ClerkAuthProvider } from "../components/ClerkAuthProvider";
import { SentryProvider } from "../components/SentryProvider";
import { AdminLanguageProvider } from "../components/AdminLanguageProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Aether Admin",
  description: "Private and public demo administration for Aether commerce."
};

const themeInitScript = `
(function () {
  try {
    if (window.localStorage.getItem("aether.admin.theme.v1") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }

    var storedLocale = window.localStorage.getItem("aether.admin.locale.v1");
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
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <style>{`html[data-locale-pending] body { visibility: hidden; }`}</style>
      </head>
      <body>
        <a
          href="#main-content"
          className="focus:bg-accent sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <SentryProvider>
          <ClerkAuthProvider>
            <AdminLanguageProvider>
              <AdminShell>{children}</AdminShell>
            </AdminLanguageProvider>
          </ClerkAuthProvider>
        </SentryProvider>
      </body>
    </html>
  );
}
