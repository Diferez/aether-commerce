import type { Metadata } from "next";
import { LegalDocument } from "../../components/LegalDocument";

export const metadata: Metadata = { title: "Shipping | Aether" };

export default function ShippingPage() {
  return <LegalDocument documentKey="shipping" />;
}
