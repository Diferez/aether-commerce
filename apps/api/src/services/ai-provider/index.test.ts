import { describe, expect, it } from "vitest";
import type { Env } from "../../types";
import { isGeminiQuotaError, resolveChatModelChain } from "./index";

function fakeEnv(overrides: Partial<Env> = {}): Env {
  return { ...overrides } as unknown as Env;
}

describe("resolveChatModelChain", () => {
  it("returns null when no API key is configured - Aether Chat is simply off, not a hard error", () => {
    expect(resolveChatModelChain(fakeEnv())).toBeNull();
  });

  it("returns a single-model chain when no fallback model is configured", () => {
    const chain = resolveChatModelChain(fakeEnv({ GEMINI_API_KEY: "key" }));
    expect(chain).toHaveLength(1);
  });

  it("returns a two-model chain, primary first, when a distinct fallback model is configured", () => {
    const chain = resolveChatModelChain(fakeEnv({ GEMINI_API_KEY: "key", GEMINI_MODEL: "gemini-primary", GEMINI_FALLBACK_MODEL: "gemini-fallback" }));
    expect(chain).toHaveLength(2);
  });

  it("does not duplicate the primary model when the fallback env var repeats it", () => {
    const chain = resolveChatModelChain(fakeEnv({ GEMINI_API_KEY: "key", GEMINI_MODEL: "gemini-primary", GEMINI_FALLBACK_MODEL: "gemini-primary" }));
    expect(chain).toHaveLength(1);
  });

  it("throws for an unrecognized AI_PROVIDER instead of silently defaulting to Gemini", () => {
    expect(() => resolveChatModelChain(fakeEnv({ GEMINI_API_KEY: "key", AI_PROVIDER: "openai" }))).toThrow(/Unknown AI_PROVIDER/);
  });
});

describe("isGeminiQuotaError", () => {
  it("recognizes an HTTP 429 status on the error object", () => {
    expect(isGeminiQuotaError({ status: 429 })).toBe(true);
  });

  it("recognizes a quota-shaped error message even without a status field", () => {
    expect(isGeminiQuotaError(new Error("RateLimitQuotaExhaustedError: daily quota exceeded"))).toBe(true);
  });

  it("does not treat an unrelated network error as a quota error", () => {
    expect(isGeminiQuotaError(new Error("network reset"))).toBe(false);
  });
});
