import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Env } from "../../types";

// Resolves the configured LangChain chat model from Env - swapping
// AI_PROVIDER/adding a new provider is writing one more case that
// instantiates that provider's own LangChain chat-model class (e.g.
// `@langchain/openai`'s ChatOpenAI, `@langchain/anthropic`'s ChatAnthropic)
// rather than hand-writing that provider's REST/SSE wire format the way
// gemini.ts used to - the CRLF-vs-LF framing bug that motivated this
// migration was exactly the kind of bug a maintained provider integration
// doesn't have. Returns the bare model - callers bind tools themselves
// (services/admin-chat/loop.ts), since this module has no reason to know
// about admin-chat's tool set.
export function resolveChatModel(env: Env): BaseChatModel | null {
  if (!env.GEMINI_API_KEY) return null;
  const provider = env.AI_PROVIDER || "gemini";
  if (provider !== "gemini") {
    throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
  return new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    temperature: 0.2,
    maxOutputTokens: 2048,
    maxRetries: 1
  });
}
