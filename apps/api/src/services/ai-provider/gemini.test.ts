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
});
