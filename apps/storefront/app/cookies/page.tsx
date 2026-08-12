import type { Metadata } from "next";
import { LegalDocument } from "../../components/LegalDocument";

export const metadata: Metadata = { title: "Cookies | Aether" };

export default function CookiesPage() {
  return <LegalDocument documentKey="cookies" />;
}
