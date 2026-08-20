export type ChatRequestContext = {
  route: string;
  module: string;
  selectedRecordId?: string;
  filters?: Record<string, string>;
};

// Assembled fresh at send time (never persisted) from whatever the operator
// is currently looking at - display/relevance only, never trusted for
// authorization (the server only uses it to make an answer more specific,
// e.g. "this order" without re-typing an id). Static export means no client
// router, so the current view is read straight from window.location, same
// as the URL-filter-sync pattern already used by the products/orders list
// pages.
export function buildChatRequestContext(): ChatRequestContext {
  if (typeof window === "undefined") return { route: "/", module: "home" };

  const { pathname, search } = window.location;
  const params = new URLSearchParams(search);
  const selectedRecordId = params.get("id");
  const filters: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key !== "id") filters[key] = value;
  });
  const module = pathname.split("/").filter(Boolean)[0] || "home";

  return {
    route: `${pathname}${search}`,
    module,
    ...(selectedRecordId ? { selectedRecordId } : {}),
    ...(Object.keys(filters).length > 0 ? { filters } : {})
  };
}
