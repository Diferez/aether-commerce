"use client";

import { ContactForm } from "@aether/storefront-default";
import { legalPolicyVersion } from "../../../../config/legal";

export default function ContactPage() {
  return <ContactForm legalPolicyVersion={legalPolicyVersion} />;
}
