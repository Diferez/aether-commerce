import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Env } from "../../types";

// Same signal apps/ai-assistant/worker.ts's isGeminiQuotaError checks for -
// duplicated rather than shared across these two separate deployables
// (apps/api and apps/ai-assistant don't share a runtime package for this),
// but kept behaviorally identical on purpose: a 429/quota error means one
// specific model's bucket is empty, not that the API is down, so it's the
// one error class worth falling through to a different model for.
export function isGeminiQuotaError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /RateLimitQuotaExhaustedError|429 Too Many Requests|quota/i.test(message);
}

// Resolves the configured LangChain chat model(s) from Env, primary first -
// swapping AI_PROVIDER/adding a new provider is writing one more case that
// instantiates that provider's own LangChain chat-model class (e.g.
// `@langchain/openai`'s ChatOpenAI, `@langchain/anthropic`'s ChatAnthropic)
// rather than hand-writing that provider's REST/SSE wire format the way
// gemini.ts used to - the CRLF-vs-LF framing bug that motivated this
// migration was exactly the kind of bug a maintained provider integration
// doesn't have. Returns bare models - callers bind tools themselves
// (services/admin-chat/loop.ts), since this module has no reason to know
// about admin-chat's tool set.
//
// GEMINI_FALLBACK_MODEL mirrors apps/ai-assistant/worker.ts's own env var
// of the same name and same purpose: a Gemini quota is per-model, not
// per-account, so a 429 on the primary model doesn't mean the API is
// unavailable - callers should retry the *next* model in this list rather
// than failing the whole turn. Optional; a deployment with only
// GEMINI_MODEL set still works exactly as before, just without fallback.
export function resolveChatModelChain(env: Env): BaseChatModel[] | null {
  if (!env.GEMINI_API_KEY) return null;
  const provider = env.AI_PROVIDER || "gemini";
  if (provider !== "gemini") {
    throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
  const apiKey = env.GEMINI_API_KEY;
  const primaryModel = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const modelNames = [primaryModel, ...(env.GEMINI_FALLBACK_MODEL && env.GEMINI_FALLBACK_MODEL !== primaryModel ? [env.GEMINI_FALLBACK_MODEL] : [])];
  return modelNames.map(
    (model) =>
      new ChatGoogleGenerativeAI({
        apiKey,
        model,
        temperature: 0.2,
        maxOutputTokens: 2048,
        // Quota errors aren't fixed by waiting and retrying the same model -
        // the fallback chain above already falls through to a different
        // model for those. One retry left for genuine transient network
        // blips, same reasoning and same value apps/ai-assistant's own
        // buildModelInvoker uses.
        maxRetries: 1
      })
  );
}
