import type { Env } from "../../types";
import { GeminiProvider } from "./gemini";
import type { GenerativeProvider } from "./types";

export type { GenerativeProvider, ProviderEvent, ProviderMessage, ProviderToolCall, ProviderToolDeclaration } from "./types";

// Resolves the configured provider from Env - swapping AI_PROVIDER/adding a
// new provider file is the only change needed to point admin-chat at a
// different model; nothing in services/admin-chat/ imports GeminiProvider
// directly.
export function resolveGenerativeProvider(env: Env): GenerativeProvider | null {
  if (!env.GEMINI_API_KEY) return null;
  const provider = env.AI_PROVIDER || "gemini";
  if (provider !== "gemini") {
    throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
  return new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL || "gemini-3.5-flash-lite");
}
