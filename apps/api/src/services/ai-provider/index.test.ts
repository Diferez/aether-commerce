import { describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@aether/core";
import type { Env } from "../../types";
import { isGeminiQuotaError, resolveChatModelChain } from "./index";

// resolveChatModelChain resolves the effective Gemini key via
// integration-settings.ts (D1-backed, admin-managed settings layered over
// this env var) - a bare D1 mock returning "no row" here so every test
// below exercises the plain env-var fallback path, same as before that
// resolution layer existed.
function fakeEnv(overrides: Partial<Env> = {}): Env {
  const db = { prepare: vi.fn(() => ({ first: vi.fn(() => Promise.resolve(null)) })) };
  return { DB: db, ...overrides } as unknown as Env;
}

describe("resolveChatModelChain", () => {
  it("returns null when no API key is configured - Aether Chat is simply off, not a hard error", async () => {
    expect(await resolveChatModelChain(fakeEnv())).toBeNull();
  });

  it("returns a single-model chain when no fallback model is configured", async () => {
    const chain = await resolveChatModelChain(fakeEnv({ GEMINI_API_KEY: "key" }));
    expect(chain).toHaveLength(1);
  });

  it("returns a two-model chain, primary first, when a distinct fallback model is configured", async () => {
    const chain = await resolveChatModelChain(fakeEnv({ GEMINI_API_KEY: "key", GEMINI_MODEL: "gemini-primary", GEMINI_FALLBACK_MODEL: "gemini-fallback" }));
    expect(chain).toHaveLength(2);
  });

  it("does not duplicate the primary model when the fallback env var repeats it", async () => {
    const chain = await resolveChatModelChain(fakeEnv({ GEMINI_API_KEY: "key", GEMINI_MODEL: "gemini-primary", GEMINI_FALLBACK_MODEL: "gemini-primary" }));
    expect(chain).toHaveLength(1);
  });

  it("returns a three-model chain from a comma-separated fallback list, in order", async () => {
    const chain = await resolveChatModelChain(
      fakeEnv({ GEMINI_API_KEY: "key", GEMINI_MODEL: "gemini-primary", GEMINI_FALLBACK_MODEL: "gemini-fallback-1, gemini-fallback-2" })
    );
    expect(chain).toHaveLength(3);
  });

  it("dedupes a fallback list that repeats itself or the primary model", async () => {
    const chain = await resolveChatModelChain(
      fakeEnv({ GEMINI_API_KEY: "key", GEMINI_MODEL: "gemini-primary", GEMINI_FALLBACK_MODEL: "gemini-fallback-1,gemini-primary,gemini-fallback-1" })
    );
    expect(chain).toHaveLength(2);
  });

  it("throws for an unrecognized AI_PROVIDER instead of silently defaulting to Gemini", async () => {
    await expect(resolveChatModelChain(fakeEnv({ GEMINI_API_KEY: "key", AI_PROVIDER: "openai" }))).rejects.toThrow(/Unknown AI_PROVIDER/);
  });

  it("works from an admin-configured Gemini key alone, with no GEMINI_API_KEY env var set", async () => {
    const encryptionKey = "test-passphrase";
    const encryptedApiKey = await encryptSecret(encryptionKey, "admin-configured-key");
    const db = {
      prepare: vi.fn(() => ({
        first: vi.fn(() => Promise.resolve({ value_json: JSON.stringify({ gemini: { apiKey: encryptedApiKey } }) }))
      }))
    };
    const chain = await resolveChatModelChain({ DB: db, AETHER_SETTINGS_ENCRYPTION_KEY: encryptionKey } as unknown as Env);
    expect(chain).toHaveLength(1);
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
