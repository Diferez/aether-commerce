import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ADMIN_CHAT_TOOLS } from "./registry";

// Gemini's function-calling parameter schema is a narrow subset of JSON
// Schema. LangChain's own converter (@langchain/google-genai's
// zod_to_genai_parameters.js, confirmed by reading the installed package)
// only strips "additionalProperties", "$schema", and "strict" from
// whatever z.toJSONSchema() produces - everything else is sent to Gemini
// as-is. That gap is exactly what broke navigate_to in production: a
// z.record() schema emitted a "propertyNames" keyword that isn't
// stripped, isn't a valid Gemini field, and made every single admin chat
// call fail with a 400 - not just calls to that one tool, since all tool
// declarations are sent together on every request.
//
// This test walks every registered tool's real Zod schema through the
// real z.toJSONSchema() converter and fails if any keyword outside a
// known-safe allowlist shows up anywhere in the tree, so a future tool
// author reintroducing z.record() (or any other construct Gemini
// rejects) is caught here instead of in production.
const KNOWN_UNSAFE_KEYS = [
  "propertyNames",
  "patternProperties",
  "unevaluatedProperties",
  "if",
  "then",
  "else",
  "const",
  "exclusiveMinimum",
  "exclusiveMaximum"
];

// Keys @langchain/google-genai's converter itself removes before sending
// to Gemini - safe to appear in the raw z.toJSONSchema() output.
const STRIPPED_BY_LANGCHAIN = new Set(["additionalProperties", "$schema", "strict"]);

function findUnsafeKeys(node: unknown, path: string, found: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => findUnsafeKeys(item, `${path}[${index}]`, found));
    return;
  }
  if (typeof node !== "object" || node === null) return;

  for (const [key, value] of Object.entries(node)) {
    if (KNOWN_UNSAFE_KEYS.includes(key) && !STRIPPED_BY_LANGCHAIN.has(key)) {
      found.push(`${path}.${key}`);
    }
    findUnsafeKeys(value, `${path}.${key}`, found);
  }
}

describe("admin chat tool schemas are Gemini-safe", () => {
  for (const tool of ADMIN_CHAT_TOOLS) {
    it(`${tool.name} converts to a schema with no unsafe JSON Schema keywords`, () => {
      const jsonSchema = z.toJSONSchema(tool.schema);
      const found: string[] = [];
      findUnsafeKeys(jsonSchema, tool.name, found);
      expect(found).toEqual([]);
    });
  }

  it("z.record() is caught by this test (regression guard for the guard itself)", () => {
    const unsafeSchema = z.object({ filters: z.record(z.string(), z.string()).optional() });
    const jsonSchema = z.toJSONSchema(unsafeSchema);
    const found: string[] = [];
    findUnsafeKeys(jsonSchema, "regression_probe", found);
    expect(found).not.toEqual([]);
  });
});
