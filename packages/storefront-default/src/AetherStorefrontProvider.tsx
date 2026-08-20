"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { ClientConfiguration } from "@aether/config-schema";

export type StorefrontRuntimeConfig = {
  /** Public config (brand, theme, store, features, ...) - the same object apps/storefront's reference deployment builds from config/aether/*. */
  config: ClientConfiguration;
  /** Resolved API base URL - env/hostname resolution stays app-side (see apps/storefront/components/config.ts), since it differs per deployment. */
  apiBaseUrl: string;
  /** Next.js basePath, if the app is deployed under a subpath. */
  basePath?: string;
};

const StorefrontConfigContext = createContext<StorefrontRuntimeConfig | null>(null);

/** Wraps a storefront app (the reference Aether deployment, or a generated client) so every default-skin component reads its brand/theme/API config from here instead of a build-time import - a shared package can't have one client's config baked in. */
export function AetherStorefrontProvider({ config, apiBaseUrl, basePath, children }: StorefrontRuntimeConfig & { children: ReactNode }) {
  return (
    <StorefrontConfigContext.Provider value={{ config, apiBaseUrl, ...(basePath !== undefined ? { basePath } : {}) }}>
      {children}
    </StorefrontConfigContext.Provider>
  );
}

export function useStorefrontConfig(): StorefrontRuntimeConfig {
  const context = useContext(StorefrontConfigContext);
  if (!context) {
    throw new Error("useStorefrontConfig must be used within AetherStorefrontProvider");
  }
  return context;
}

// Mirrors apps/storefront/components/config.ts's storefrontPath() exactly
// (next.config.mjs's trailingSlash: true means every static page is emitted
// as e.g. /account/index.html, only reliably reachable at /account/), just
// reading basePath from context instead of a static env-var read.
export function useStorefrontPath() {
  const { basePath } = useStorefrontConfig();
  const normalizedBase = (basePath || "").replace(/\/$/, "");
  return function storefrontPath(path = "/"): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const queryIndex = normalizedPath.search(/[?#]/);
    const pathname = queryIndex === -1 ? normalizedPath : normalizedPath.slice(0, queryIndex);
    const suffix = queryIndex === -1 ? "" : normalizedPath.slice(queryIndex);
    const pathnameWithSlash = pathname.endsWith("/") ? pathname : `${pathname}/`;
    return `${normalizedBase}${pathnameWithSlash}${suffix}` || "/";
  };
}
