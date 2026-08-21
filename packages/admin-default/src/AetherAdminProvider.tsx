"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { ClientConfiguration } from "@aether-commerce/config-schema";

export type AdminRuntimeConfig = {
  /** Public config (brand, features, ...) - the admin slice of the same ClientConfiguration the storefront package reads (see templates/client/src/adapters.ts's existing "admin" slice: brand/features/api). */
  config: ClientConfiguration;
  /** Resolved API base URL - env resolution stays app-side, since it differs per deployment. */
  apiBaseUrl: string;
  /** Link target for "open storefront" - optional since not every client links a storefront from the admin panel. */
  storefrontUrl?: string;
};

const AdminConfigContext = createContext<AdminRuntimeConfig | null>(null);

/** Wraps an admin app (the reference Aether deployment, or a generated client) so every default-skin component reads its brand/API config from here instead of a build-time import. */
export function AetherAdminProvider({ config, apiBaseUrl, storefrontUrl, children }: AdminRuntimeConfig & { children: ReactNode }) {
  return (
    <AdminConfigContext.Provider value={{ config, apiBaseUrl, ...(storefrontUrl !== undefined ? { storefrontUrl } : {}) }}>
      {children}
    </AdminConfigContext.Provider>
  );
}

export function useAdminConfig(): AdminRuntimeConfig {
  const context = useContext(AdminConfigContext);
  if (!context) {
    throw new Error("useAdminConfig must be used within AetherAdminProvider");
  }
  return context;
}
