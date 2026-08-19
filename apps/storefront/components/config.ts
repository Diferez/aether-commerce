import {
  aetherAgentConfig,
  aetherIntegrationConfig,
  aetherNavigationConfig
} from "../../../config/aether";

const productionApiBaseUrl = aetherIntegrationConfig.api.productionBaseUrl;
const productionAiAssistantUrl = "https://aether-ai.pickofwow.workers.dev";

// Next.js only exposes public environment variables to browser bundles when
// their names are statically analyzable. The allowlist also makes it impossible
// for implementation config to resolve a server-only variable in the browser.
function resolvePublicRuntimeValue(name: string | undefined): string | undefined {
  switch (name) {
    case "NEXT_PUBLIC_AETHER_AI_URL":
      return process.env.NEXT_PUBLIC_AETHER_AI_URL;
    case "NEXT_PUBLIC_PORTFOLIO_URL":
      return process.env.NEXT_PUBLIC_PORTFOLIO_URL;
    default:
      return undefined;
  }
}

function resolveApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_AETHER_API_URL?.trim();
  if (configured) return configured;

  if (typeof window !== "undefined" && window.location.hostname.endsWith("pickofwow.workers.dev")) {
    return productionApiBaseUrl;
  }

  return aetherIntegrationConfig.api.localBaseUrl;
}

function resolveAiAssistantUrl() {
  const configured = process.env.NEXT_PUBLIC_AETHER_AI_URL?.trim();
  if (configured) return configured;

  if (typeof window !== "undefined" && window.location.hostname.endsWith("pickofwow.workers.dev")) {
    return productionAiAssistantUrl;
  }

  return "";
}

export const apiBaseUrl = resolveApiBaseUrl();

export const aiAssistantUrl =
  resolvePublicRuntimeValue(aetherAgentConfig.publicUrlEnv)?.trim() || resolveAiAssistantUrl();

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
  ? resolvePublicRuntimeValue(aetherNavigationConfig.portfolioUrlEnv)?.trim()
  : undefined;

export const portfolioUrl = configuredPortfolioUrl || aetherNavigationConfig.portfolioUrl;
