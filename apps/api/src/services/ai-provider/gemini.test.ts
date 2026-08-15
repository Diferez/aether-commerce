import { describe, expect, it, vi } from "vitest";
import { GeminiProvider, parseGeminiSseBuffer } from "./gemini";

describe("parseGeminiSseBuffer", () => {
  it("parses complete frames and carries over an incomplete trailing frame", () => {
    const buffer = 'data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c":';
    const { payloads, remainder } = parseGeminiSseBuffer(buffer);
    expect(payloads).toEqual([{ a: 1 }, { b: 2 }]);
    expect(remainder).toBe('data: {"c":');
  });

  it("drops a malformed frame instead of throwing", () => {
    const buffer = "data: {not json}\n\ndata: {\"ok\":true}\n\n";
    const { payloads } = parseGeminiSseBuffer(buffer);
    expect(payloads).toEqual([{ ok: true }]);
  });

  it("returns nothing for an empty buffer", () => {
    expect(parseGeminiSseBuffer("")).toEqual({ payloads: [], remainder: "" });
  });
});

function sseChunk(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
  return new Response(stream, { status: 200 });
}

describe("GeminiProvider.converse", () => {
  it("emits text deltas and a tool_call event mapped from Gemini's functionCall part", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        sseChunk({ candidates: [{ content: { parts: [{ text: "Checking " }] } }] }),
        sseChunk({
          candidates: [{ content: { parts: [{ functionCall: { name: "search_products", args: { query: "phone case" } } }] } }]
        })
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiProvider("test-key", "gemini-test");
    const events = [];
    for await (const event of provider.converse({ systemPrompt: "sys", messages: [{ role: "user", content: "hi" }], tools: [] })) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: "text_delta", text: "Checking " });
    expect(events.some((event) => event.type === "tool_call" && event.toolCall.name === "search_products" && event.toolCall.args.query === "phone case")).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done", finishReason: "tool_calls" });

    vi.unstubAllGlobals();
  });

  it("yields an error event instead of throwing when the HTTP response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    const provider = new GeminiProvider("test-key", "gemini-test");
    const events = [];
    for await (const event of provider.converse({ systemPrompt: "sys", messages: [], tools: [] })) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "error", message: "Gemini responded with status 500." }]);
    vi.unstubAllGlobals();
  });

  it("includes Gemini's actual error body in the error event, not just the status code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Invalid JSON payload received." } }), { status: 400 }))
    );

    const provider = new GeminiProvider("test-key", "gemini-test");
    const events = [];
    for await (const event of provider.converse({ systemPrompt: "sys", messages: [], tools: [] })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error" });
    if (events[0]?.type === "error") {
      expect(events[0].message).toContain("Invalid JSON payload received.");
    }
    vi.unstubAllGlobals();
  });

  it("sends only Gemini's supported schema keywords for a tool's parameters, stripping the rest of zod's JSON Schema output", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(streamResponse([sseChunk({ candidates: [{ content: { parts: [{ text: "ok" }] } }] })]));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiProvider("test-key", "gemini-test");
    const richSchema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        productId: { type: "string", minLength: 1, description: "The product id" },
        stock: { type: "integer", minimum: 0, maximum: 9007199254740991, default: 10 },
        visibility: { type: "string", enum: ["draft", "visible", "hidden"] }
      },
      required: ["productId"],
      additionalProperties: false
    };
    const events = [];
    for await (const event of provider.converse({
      systemPrompt: "sys",
      messages: [],
      tools: [{ name: "test_tool", description: "test", parameters: richSchema }]
    })) {
      events.push(event);
    }

    const sentBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      tools: Array<{ functionDeclarations: Array<{ parameters: Record<string, unknown> }> }>;
    };
    const sentParameters = sentBody.tools[0]?.functionDeclarations[0]?.parameters;

    expect(sentParameters).toEqual({
      type: "object",
      required: ["productId"],
      properties: {
        productId: { type: "string", description: "The product id" },
        stock: { type: "integer" },
        visibility: { type: "string", enum: ["draft", "visible", "hidden"] }
      }
    });
    expect(sentParameters).not.toHaveProperty("$schema");
    expect(sentParameters).not.toHaveProperty("additionalProperties");

    vi.unstubAllGlobals();
  });
});
