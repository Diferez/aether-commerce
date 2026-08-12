import type { Metadata } from "next";
import { LegalDocument } from "../../components/LegalDocument";

export const metadata: Metadata = { title: "Returns | Aether" };

export default function ReturnsPage() {
  return <LegalDocument documentKey="returns" />;
}
