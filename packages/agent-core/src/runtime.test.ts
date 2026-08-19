import { describe, expect, it } from "vitest";
import { executeAgentModelText, parseAgentModelJson } from "./runtime";

describe("agent runtime", () => {
  it("retries only when a caller opts in and invokes accounting hooks per attempt", async () => {
    let calls = 0;
    let accountedAttempts = 0;
    const text = await executeAgentModelText({
      provider: {
        generate: () => {
          calls += 1;
          return Promise.resolve(calls === 2 ? "ready" : null);
        }
      },
      request: { systemPrompt: "system", message: "message", temperature: 0, maxOutputTokens: 10 },
      maxAttempts: 2,
      onAttempt: () => {
        accountedAttempts += 1;
      }
    });

    expect(text).toBe("ready");
    expect(calls).toBe(2);
    expect(accountedAttempts).toBe(2);
  });

  it("never lets malformed model JSON cross the runtime boundary", () => {
    expect(parseAgentModelJson('{"intent":"SEARCH_PRODUCTS"}')).toEqual({ intent: "SEARCH_PRODUCTS" });
    expect(parseAgentModelJson("not-json")).toEqual({});
    expect(parseAgentModelJson(null)).toEqual({});
  });
});
