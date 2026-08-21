"use client";

import { HomePage } from "@aether-commerce/storefront-default";
import { ContactForm } from "../components/ContactForm";
import { legalPolicyVersion } from "../components/legal-content";

// Wraps the package's generic HomePage instead of duplicating its Hero/
// category/product-rail/benefits composition - only the contactForm slot is
// deployment-specific (this deployment's own real ContactForm override).
export default function Page() {
  return <HomePage legalPolicyVersion={legalPolicyVersion} contactForm={<ContactForm />} />;
}
