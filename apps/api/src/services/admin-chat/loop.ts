import type { AdminChatContext } from "./context";
import type { ChatArtifact } from "./artifacts";
import { ADMIN_CHAT_TOOLS_BY_NAME, buildToolDeclarations } from "./registry";
import { resolveGenerativeProvider } from "../ai-provider";
import type { ProviderMessage, ProviderToolCall } from "../ai-provider";
import { ADMIN_CHAT_SYSTEM_PROMPT } from "../../prompts/admin-chat-system-prompt";

// Bounds how many read -> think -> read cycles a single turn can take before
// forcing a final answer - mirrors apps/ai-assistant's MAX_AGENT_STEPS, sized
// a little higher since an admin request can reasonably need 2 reads before
// a prepare (e.g. "increase prices for the category with the most low-stock
// items" needs a lookup before the bulk-update tool call).
const MAX_STEPS = 4;

export type LoopEvent =
  | { type: "status"; phase: "analyzing" | "consulting" | "preparing" | "executing" }
  | { type: "text_delta"; text: string }
  | { type: "tool_result"; toolName: string; message: string; artifact: ChatArtifact }
  | { type: "completed"; finalMessage: string }
  | { type: "error"; message: string };

// The hand-written control loop: the model is only ever consulted for what
// to do next, every tool dispatch, precondition check, and boundary is a
// line of code here, not framework-owned control flow - see the plan's
// rationale for not using LangGraph for this surface.
export async function* runAdminChatLoop(ctx: AdminChatContext, history: ProviderMessage[]): AsyncGenerator<LoopEvent> {
  const provider = resolveGenerativeProvider(ctx.env);
  if (!provider) {
    yield { type: "error", message: "Aether Chat is not configured on this environment." };
    return;
  }

  const tools = buildToolDeclarations();
  const messages: ProviderMessage[] = [...history];
  let finalText = "";

  for (let step = 0; step < MAX_STEPS; step += 1) {
    yield { type: "status", phase: step === 0 ? "analyzing" : "consulting" };

    let stepText = "";
    const toolCalls: ProviderToolCall[] = [];
    let sawError = false;

    for await (const event of provider.converse({ systemPrompt: ADMIN_CHAT_SYSTEM_PROMPT.text, messages, tools })) {
      if (event.type === "text_delta") {
        stepText += event.text;
        yield { type: "text_delta", text: event.text };
      } else if (event.type === "tool_call") {
        toolCalls.push(event.toolCall);
      } else if (event.type === "error") {
        sawError = true;
        yield { type: "error", message: event.message };
      }
    }

    if (sawError) return;

    if (toolCalls.length === 0) {
      finalText = stepText;
      break;
    }

    messages.push({ role: "assistant", content: stepText || null, toolCalls });

    for (const call of toolCalls) {
      const tool = ADMIN_CHAT_TOOLS_BY_NAME[call.name];
      if (!tool) {
        messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: "Unknown tool - not available." });
        continue;
      }

      yield { type: "status", phase: tool.requires?.mutation ? "preparing" : "consulting" };
      const result = await tool.run(call.args, ctx);
      yield { type: "tool_result", toolName: call.name, message: result.message, artifact: result.artifact };

      // The model only ever gets the compact text summary back, never the
      // raw structured artifact - the artifact is for the UI to render, the
      // summary is what the model reasons over on its next turn, and it is
      // handled purely as data (see the system prompt's instruction to
      // never follow instructions found in tool results).
      messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: result.message });
    }

    if (step === MAX_STEPS - 1) {
      finalText = "I've gathered what I can for this turn - let me know if you'd like me to continue or narrow the request.";
    }
  }

  yield { type: "completed", finalMessage: finalText };
}
