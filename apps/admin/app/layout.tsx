import type { Metadata } from "next";
import "./globals.css";
import { AdminNav } from "../components/AdminNav";
import { ClerkAuthProvider } from "../components/ClerkAuthProvider";

export const metadata: Metadata = {
  title: "Aether Admin",
  description: "Private and public demo administration for Aether commerce."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-zinc-950 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <ClerkAuthProvider>
          <AdminNav />
          {children}
        </ClerkAuthProvider>
      </body>
    </html>
  );
}
