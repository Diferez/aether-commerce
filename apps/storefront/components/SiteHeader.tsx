"use client";

import { SiteHeader as PackageSiteHeader } from "@aether-commerce/storefront-default";
import { portfolioUrl } from "./config";

export function SiteHeader() {
  return <PackageSiteHeader {...(portfolioUrl !== undefined ? { portfolioUrl } : {})} />;
}
