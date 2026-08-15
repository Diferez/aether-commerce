import type { GenerativeProvider, ProviderEvent, ProviderMessage, ProviderToolDeclaration } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 30_000): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GeminiContent = { role: "user" | "model" | "function"; parts: GeminiPart[] };

function toGeminiContents(messages: ProviderMessage[]): GeminiContent[] {
  return messages.map((message): GeminiContent => {
    if (message.role === "user") {
      return { role: "user", parts: [{ text: message.content }] };
    }
    if (message.role === "tool") {
      return {
        role: "function",
        parts: [{ functionResponse: { name: message.toolName, response: { content: message.content } } }]
      };
    }
    const parts: GeminiPart[] = [];
    if (message.content) parts.push({ text: message.content });
    for (const call of message.toolCalls ?? []) {
      parts.push({ functionCall: { name: call.name, args: call.args } });
    }
    return { role: "model", parts };
  });
}

// Gemini's functionDeclarations.parameters accepts an OpenAPI-3.0-flavored
// JSON Schema - close enough to the plain JSON Schema zod v4 emits that only
// the fields it doesn't recognize (draft metadata, additionalProperties) need
// stripping. Our tool schemas are flat objects (no $ref/definitions), so no
// schema-graph resolution is needed here.
function cleanSchemaForGemini(schema: Record<string, unknown>): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...schema };
  delete rest.$schema;
  delete rest.additionalProperties;
  if (rest.properties && typeof rest.properties === "object") {
    const properties = rest.properties as Record<string, unknown>;
    rest.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        typeof value === "object" && value !== null ? cleanSchemaForGemini(value as Record<string, unknown>) : value
      ])
    );
  }
  return rest;
}

function toGeminiTools(tools: ProviderToolDeclaration[]): unknown[] {
  if (tools.length === 0) return [];
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: cleanSchemaForGemini(tool.parameters)
      }))
    }
  ];
}

// Parses one or more `data: {...}\n\n` SSE frames out of a decoded text
// buffer, returning the parsed JSON payloads and whatever partial frame is
// still incomplete (carried over to the next chunk). Pure and testable
// independent of fetch/streaming - see ai-provider/gemini.test.ts.
export function parseGeminiSseBuffer(buffer: string): { payloads: unknown[]; remainder: string } {
  const frames = buffer.split("\n\n");
  const remainder = frames.pop() ?? "";
  const payloads: unknown[] = [];
  for (const frame of frames) {
    const line = frame.split("\n").find((candidate) => candidate.startsWith("data:"));
    if (!line) continue;
    const json = line.slice(5).trim();
    if (!json || json === "[DONE]") continue;
    try {
      payloads.push(JSON.parse(json));
    } catch {
      // A malformed frame is dropped rather than aborting the whole stream.
    }
  }
  return { payloads, remainder };
}

type GeminiCandidate = {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
};
type GeminiStreamChunk = { candidates?: GeminiCandidate[] };

function partsFromChunk(chunk: unknown): { textParts: string[]; functionCalls: Array<{ name: string; args: Record<string, unknown> }>; finishReason?: string | undefined } {
  const candidate = (chunk as GeminiStreamChunk)?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const textParts: string[] = [];
  const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  for (const part of parts) {
    if ("text" in part && part.text) textParts.push(part.text);
    if ("functionCall" in part && part.functionCall) {
      functionCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} });
    }
  }
  return { textParts, functionCalls, finishReason: candidate?.finishReason };
}

export class GeminiProvider implements GenerativeProvider {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async *converse(input: {
    systemPrompt: string;
    messages: ProviderMessage[];
    tools: ProviderToolDeclaration[];
  }): AsyncGenerator<ProviderEvent> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    const body = {
      systemInstruction: { parts: [{ text: input.systemPrompt }] },
      contents: toGeminiContents(input.messages),
      tools: toGeminiTools(input.tools),
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
    };

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (error) {
      yield { type: "error", message: error instanceof Error ? error.message : "Gemini request failed." };
      return;
    }

    if (!response.ok || !response.body) {
      yield { type: "error", message: `Gemini responded with status ${response.status}.` };
      return;
    }

    const reader = response.body.getReader();
    let buffer = "";
    let calledTool = false;
    let finishReason: string | undefined;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { payloads, remainder } = parseGeminiSseBuffer(buffer);
        buffer = remainder;
        for (const payload of payloads) {
          const { textParts, functionCalls, finishReason: chunkFinish } = partsFromChunk(payload);
          if (chunkFinish) finishReason = chunkFinish;
          for (const text of textParts) {
            if (text) yield { type: "text_delta", text };
          }
          for (const call of functionCalls) {
            calledTool = true;
            yield { type: "tool_call", toolCall: { id: crypto.randomUUID(), name: call.name, args: call.args } };
          }
        }
      }
    } catch (error) {
      yield { type: "error", message: error instanceof Error ? error.message : "Gemini stream failed." };
      return;
    }

    if (calledTool) {
      yield { type: "done", finishReason: "tool_calls" };
    } else if (finishReason === "MAX_TOKENS") {
      yield { type: "done", finishReason: "max_tokens" };
    } else {
      yield { type: "done", finishReason: "stop" };
    }
  }
}

export function encodeForTest(text: string): Uint8Array {
  return encoder.encode(text);
}
