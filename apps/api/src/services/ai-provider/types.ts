// The one seam between the admin-chat tool-calling loop
// (services/admin-chat/loop.ts) and whatever LLM actually runs it.
// Swapping models or providers means writing a new file that satisfies
// GenerativeProvider - nothing in services/admin-chat/ ever touches a
// provider's wire format directly.

export type ProviderToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type ProviderMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ProviderToolCall[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string };

export type ProviderToolDeclaration = {
  name: string;
  description: string;
  /** JSON-Schema-shaped parameter description, derived from the tool's Zod input schema. */
  parameters: Record<string, unknown>;
};

export type ProviderEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; toolCall: ProviderToolCall }
  | { type: "done"; finishReason: "stop" | "tool_calls" | "max_tokens" | "error" }
  | { type: "error"; message: string };

export type GenerativeProvider = {
  converse(input: {
    systemPrompt: string;
    messages: ProviderMessage[];
    tools: ProviderToolDeclaration[];
  }): AsyncGenerator<ProviderEvent>;
};
