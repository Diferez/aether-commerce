"use client";

import { ContactForm } from "@aether/storefront-default";
import { legalPolicyVersion } from "../../../config/legal.js";

export default function ContactPage() {
  return <ContactForm legalPolicyVersion={legalPolicyVersion} />;
}
