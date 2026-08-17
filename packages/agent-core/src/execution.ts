import type { AgentIntentName } from "./index";

/** Coarse deterministic graph nodes shared by Worker or server agent adapters. */
export type AgentExecutionPlan =
  | "unsupported"
  | "cart_read"
  | "cart_mutation"
  | "product_discovery";

/**
 * Maps a normalized intent to a capability group without knowing concrete
 * tools, APIs, brands or runtime infrastructure.
 */
export function createAgentExecutionPlan(intent: AgentIntentName): AgentExecutionPlan {
  if (intent === "UNSUPPORTED") return "unsupported";
  if (intent === "GET_CART" || intent === "CHECKOUT_REQUEST") return "cart_read";
  if (intent === "ADD_TO_CART" || intent === "UPDATE_CART_ITEM" || intent === "REMOVE_FROM_CART" || intent === "CLEAR_CART") {
    return "cart_mutation";
  }
  return "product_discovery";
}
