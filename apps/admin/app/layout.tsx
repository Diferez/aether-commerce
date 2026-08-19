import type { Metadata } from "next";
import "./globals.css";
import { AdminNav } from "../components/AdminNav";
import { ClerkAuthProvider } from "../components/ClerkAuthProvider";
import { aetherBrandConfig, aetherThemeTokens } from "../components/configuration";

export const metadata: Metadata = {
  title: `${aetherBrandConfig.name} Admin`,
  description: `Private and public demo administration for ${aetherBrandConfig.name} commerce.`
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`:root { --color-accent: ${aetherThemeTokens.primary}; }`}</style>
      </head>
      <body>
        <ClerkAuthProvider>
          <AdminNav />
          {children}
        </ClerkAuthProvider>
      </body>
    </html>
  );
}
