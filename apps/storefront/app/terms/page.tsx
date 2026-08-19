import type { Metadata } from "next";
import { LegalDocument } from "../../components/LegalDocument";

export const metadata: Metadata = { title: "Terms | Aether" };

export default function TermsPage() {
  return <LegalDocument documentKey="terms" />;
}
