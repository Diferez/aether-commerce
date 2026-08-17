import {
  aetherAgentConfig,
  aetherIntegrationConfig,
  aetherNavigationConfig
} from "../config";

const productionApiBaseUrl = aetherIntegrationConfig.api.productionBaseUrl;

function resolveApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_AETHER_API_URL?.trim();
  if (configured) return configured;

  if (typeof window !== "undefined" && window.location.hostname.endsWith("pickofwow.workers.dev")) {
    return productionApiBaseUrl;
  }

  return aetherIntegrationConfig.api.localBaseUrl;
}

export const apiBaseUrl = resolveApiBaseUrl();

export const aiAssistantUrl = process.env[aetherAgentConfig.publicUrlEnv]?.trim() || "";

export const storefrontBasePath = (process.env.NEXT_PUBLIC_AETHER_BASE_PATH || "").replace(/\/$/, "");

// next.config.mjs sets trailingSlash: true, so every static page is emitted at
// e.g. /account/index.html and only resolves without an extra redirect hop at
// /account/ (not /account). Building URLs without the slash here works most of
// the time (the host 307s to the slash form) but that redirect has proven
// unreliable for full-page client-side navigations, so always emit it.
export function storefrontPath(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const queryIndex = normalizedPath.search(/[?#]/);
  const pathname = queryIndex === -1 ? normalizedPath : normalizedPath.slice(0, queryIndex);
  const suffix = queryIndex === -1 ? "" : normalizedPath.slice(queryIndex);
  const pathnameWithSlash = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return `${storefrontBasePath}${pathnameWithSlash}${suffix}` || "/";
}

const configuredPortfolioUrl = aetherNavigationConfig.portfolioUrlEnv
  ? process.env[aetherNavigationConfig.portfolioUrlEnv]?.trim()
  : undefined;

export const portfolioUrl = configuredPortfolioUrl || aetherNavigationConfig.portfolioUrl;
