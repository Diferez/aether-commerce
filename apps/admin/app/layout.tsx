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
        <ClerkAuthProvider>
          <AdminNav />
          {children}
        </ClerkAuthProvider>
      </body>
    </html>
  );
}
