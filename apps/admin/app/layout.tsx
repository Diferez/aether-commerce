import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AdminShell } from "../components/AdminShell";
import { ClerkAuthProvider } from "../components/ClerkAuthProvider";

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
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <a
          href="#main-content"
          className="focus:bg-accent sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <ClerkAuthProvider>
          <AdminShell>{children}</AdminShell>
        </ClerkAuthProvider>
      </body>
    </html>
  );
}
