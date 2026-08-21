"use client";

import { HomePage } from "@aether/storefront-default";
import { legalPolicyVersion } from "../../../config/legal";

/**
 * Default home page - keep this file as-is to use the default skin, or
 * replace its contents with your own composition (you can still import and
 * reuse individual pieces like Hero/SiteFooter/CategoryGrid/ProductGrid, or
 * drop them entirely). See README.md for the full override pattern.
 */
export default function StorefrontHomePage() {
  return <HomePage legalPolicyVersion={legalPolicyVersion} />;
}
