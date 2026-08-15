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

// Gemini's functionDeclarations.parameters only understands a narrow subset
// of JSON Schema (roughly: type, description, enum, properties, required,
// items, nullable) - it rejects a schema carrying full JSON Schema draft-07
// keywords like $schema, additionalProperties, minLength/maxLength,
// minimum/maximum, default, or format with a 400. zod v4's toJSONSchema()
// emits all of those, so this rebuilds a minimal, whitelisted schema rather
// than trying to strip an unbounded set of "keywords Gemini doesn't like".
// The dropped bounds aren't a real validation gap: defineAdminChatTool's
// spec.schema.safeParse(rawArgs) still authoritatively enforces them
// server-side regardless of what the model was told in the schema.
function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const rawType = schema.type;
  if (Array.isArray(rawType)) {
    const nonNull = rawType.filter((candidate) => candidate !== "null");
    if (nonNull[0] !== undefined) out.type = nonNull[0];
    if (rawType.includes("null")) out.nullable = true;
  } else if (typeof rawType === "string") {
    out.type = rawType;
  }

  if (typeof schema.description === "string") out.description = schema.description;
  if (Array.isArray(schema.enum)) out.enum = schema.enum;
  if (Array.isArray(schema.required)) out.required = schema.required;

  if (schema.properties && typeof schema.properties === "object") {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties as Record<string, unknown>).map(([key, value]) => [
        key,
        typeof value === "object" && value !== null ? toGeminiSchema(value as Record<string, unknown>) : value
      ])
    );
  }
  if (schema.items && typeof schema.items === "object") {
    out.items = toGeminiSchema(schema.items as Record<string, unknown>);
  }

  return out;
}

function toGeminiTools(tools: ProviderToolDeclaration[]): unknown[] {
  if (tools.length === 0) return [];
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: toGeminiSchema(tool.parameters)
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

    console.log(JSON.stringify({ message: "gemini.request", model: this.model, messageCount: input.messages.length, toolCount: input.tools.length }));

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (error) {
      console.error(JSON.stringify({ message: "gemini.fetch_failed", error: error instanceof Error ? error.message : String(error) }));
      yield { type: "error", message: error instanceof Error ? error.message : "Gemini request failed." };
      return;
    }

    console.log(JSON.stringify({ message: "gemini.response", status: response.status, hasBody: Boolean(response.body) }));

    if (!response.ok || !response.body) {
      // Surface Gemini's actual error body (never the request, which
      // carries the API key in its query string) - a bare status code was
      // not enough to diagnose a real 400 this exact code produced once
      // (an invalid tool-parameter schema), and won't be enough next time
      // either.
      const detail = await response
        .text()
        .then((text) => text.slice(0, 500))
        .catch(() => "");
      console.error(JSON.stringify({ message: "gemini.error_response", status: response.status, detail }));
      yield { type: "error", message: `Gemini responded with status ${response.status}.${detail ? ` ${detail}` : ""}` };
      return;
    }

    const reader = response.body.getReader();
    let buffer = "";
    let calledTool = false;
    let finishReason: string | undefined;
    let chunkCount = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunkCount += 1;
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
      console.error(JSON.stringify({ message: "gemini.stream_failed", chunkCount, error: error instanceof Error ? error.message : String(error) }));
      yield { type: "error", message: error instanceof Error ? error.message : "Gemini stream failed." };
      return;
    }

    console.log(JSON.stringify({ message: "gemini.stream_done", chunkCount, calledTool, finishReason: finishReason ?? null }));

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
