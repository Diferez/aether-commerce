import { describe, expect, it } from "vitest";
import { navigateToTool } from "./navigation";
import { fakeContext, fakeEnv } from "../test-support";

describe("navigateToTool", () => {
  it("builds a plain module link when no filters are given", async () => {
    const { env } = fakeEnv();
    const result = await navigateToTool.run({ module: "products" }, fakeContext(env));
    expect(result.artifact).toMatchObject({ type: "navigate", href: "/products/" });
  });

  // filters is an array of {key, value} pairs, not a record - Gemini's
  // function-calling schema (via LangChain's bindTools) rejects the
  // "propertyNames" keyword zod emits for record types (confirmed live: a
  // real 400 "Unknown name \"propertyNames\"... Cannot find field").
  it("builds a filtered link from an array of key/value pairs, not a record", async () => {
    const { env } = fakeEnv();
    const result = await navigateToTool.run(
      { module: "products", filters: [{ key: "stock", value: "out" }, { key: "category", value: "shoes" }] },
      fakeContext(env)
    );
    expect(result.artifact).toMatchObject({ type: "navigate", href: "/products/?stock=out&category=shoes" });
  });

  it("does not append a query string for an empty filters array", async () => {
    const { env } = fakeEnv();
    const result = await navigateToTool.run({ module: "orders", filters: [] }, fakeContext(env));
    expect(result.artifact).toMatchObject({ type: "navigate", href: "/orders/" });
  });
});
