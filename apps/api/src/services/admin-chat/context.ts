import type { Actor } from "@aether/schemas";
import type { Env } from "../../types";

export type ClientVisibleContext = {
  route?: string;
  module?: string;
  selectedRecordId?: string;
  filters?: Record<string, string>;
};

export type AdminChatContext = {
  env: Env;
  actor: Actor;
  requestId: string;
  conversationId: string;
  visible: ClientVisibleContext;
};

const MAX_FILTER_ENTRIES = 10;
const MAX_STRING_LENGTH = 200;

function clampString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.slice(0, MAX_STRING_LENGTH);
}

// The client tells the server what it's currently looking at (route, open
// module, selected record, active filters) so responses can be more
// relevant - e.g. "this order" without the operator re-typing an id. None of
// it is ever used to authorize anything (that's the server-verified actor
// only) and it's clamped to a handful of short strings so a buggy or hostile
// client can't smuggle an arbitrarily large payload into the model's context.
export function buildClientVisibleContext(raw: unknown): ClientVisibleContext {
  if (typeof raw !== "object" || raw === null) return {};
  const value = raw as Record<string, unknown>;
  const visible: ClientVisibleContext = {};

  const route = clampString(value.route);
  if (route) visible.route = route;
  const moduleName = clampString(value.module);
  if (moduleName) visible.module = moduleName;
  const selectedRecordId = clampString(value.selectedRecordId);
  if (selectedRecordId) visible.selectedRecordId = selectedRecordId;

  if (typeof value.filters === "object" && value.filters !== null) {
    const entries = Object.entries(value.filters as Record<string, unknown>)
      .slice(0, MAX_FILTER_ENTRIES)
      .map(([key, val]) => [clampString(key), clampString(val)] as const)
      .filter((entry): entry is [string, string] => entry[0] !== undefined && entry[1] !== undefined);
    if (entries.length > 0) visible.filters = Object.fromEntries(entries);
  }

  return visible;
}
