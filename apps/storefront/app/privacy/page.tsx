import type { Metadata } from "next";
import { LegalDocument } from "../../components/LegalDocument";

export const metadata: Metadata = { title: "Privacy | Aether" };

export default function PrivacyPage() {
  return <LegalDocument documentKey="privacy" />;
}
