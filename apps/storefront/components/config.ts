const productionApiBaseUrl = "https://aether-api.pickofwow.workers.dev";
const productionAiAssistantUrl = "https://aether-ai.pickofwow.workers.dev";
const productionPortfolioUrl = "https://portafolio-aether-commerce.pickofwow.workers.dev";

function resolveApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_AETHER_API_URL?.trim();
  if (configured) return configured;

  if (typeof window !== "undefined" && window.location.hostname.endsWith("pickofwow.workers.dev")) {
    return productionApiBaseUrl;
  }

  return "http://localhost:8787";
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

export const aiAssistantUrl = resolveAiAssistantUrl();

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

const configuredPortfolioUrl = process.env.NEXT_PUBLIC_PORTFOLIO_URL?.trim();

export const portfolioUrl = configuredPortfolioUrl || productionPortfolioUrl;
