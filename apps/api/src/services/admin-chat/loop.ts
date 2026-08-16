import { z } from "zod";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import type { Runnable, RunnableConfig } from "@langchain/core/runnables";
import type { AdminChatContext } from "./context";
import type { ChatArtifact } from "./artifacts";
import { ADMIN_CHAT_LANGCHAIN_TOOLS, type AdminChatCustomEvent } from "./registry";
import { resolveChatModel } from "../ai-provider";
import { ADMIN_CHAT_SYSTEM_PROMPT } from "../../prompts/admin-chat-system-prompt";

// Bounds how many agent -> tools -> agent passes a single turn can take
// before forcing a final answer - mirrors apps/ai-assistant's
// MAX_AGENT_STEPS, sized a little higher since an admin request can
// reasonably need 2 reads before a prepare, plus one extra pass of
// headroom so a verify-triggered retry (see verifyNode below) still has
// room to actually call the tool it flagged as missing instead of
// immediately re-hitting this same budget wall.
const MAX_STEPS = 5;

export type LoopEvent =
  | { type: "status"; phase: "analyzing" | "consulting" | "preparing" | "executing" }
  | { type: "text_delta"; text: string }
  | { type: "tool_result"; toolName: string; message: string; artifact: ChatArtifact }
  | { type: "completed"; finalMessage: string }
  | { type: "error"; message: string };

type AdminAgentData = {
  ctx: AdminChatContext;
  toolCallCount: number;
  // verifyNode's own retry budget - deliberately separate from
  // toolCallCount/MAX_STEPS so "did we already ask the model to try again"
  // stays true regardless of how much step budget is left.
  verifyRetries: number;
  verifyDecision: "pending" | "retry" | "final";
};

const AdminAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: (left, right) => left.concat(right), default: () => [] }),
  data: Annotation<AdminAgentData>()
});

type AdminAgentStateType = { messages: BaseMessage[]; data: AdminAgentData };

const CriticVerdictSchema = z.object({
  ok: z
    .boolean()
    .describe(
      "True only if the draft reply fully addresses what the operator asked - including actually invoking the right prepare_* tool when the operator asked for a change, not just describing what could be done."
    ),
  feedback: z.string().describe("If ok is false, one or two concrete sentences telling the assistant exactly what it still needs to do to finish the request. Empty string if ok is true.")
});

const CRITIC_SYSTEM_TEXT = `You are a strict quality reviewer for Aether Chat, an internal admin assistant. You will be shown what the operator asked, which tools the assistant already called this turn and what each returned, and the assistant's draft reply. Judge only whether the draft reply actually resolves the operator's request:
- If the operator asked for something to change (a status, a price, stock, etc.) and no prepare_* tool was called, that is a failure unless the draft reply clearly explains why the change can't be made.
- If the draft reply contradicts or ignores information already returned by a tool, that is a failure.
- A short reply that correctly answers a read-only question is fine - never penalize brevity by itself.
Respond only through the structured schema you were given.`;

// LangGraph node config carries a `writer` callback for "custom" stream
// mode - verified live against the installed @langchain/langgraph version
// that this, not @langchain/core's dispatchCustomEvent, is what actually
// reaches a caller using streamMode:["updates","custom"] (dispatchCustomEvent
// relies on a callback manager that isn't wired up in a bare graph.stream()
// call here; config.writer is LangGraph's own native channel for exactly
// this and needed no extra wiring).
type AdminChatNodeConfig = RunnableConfig & {
  configurable?: {
    boundModel?: Runnable<BaseMessage[], AIMessageChunk>;
    criticModel?: Runnable<BaseMessage[], { ok: boolean; feedback: string }>;
  };
  writer?: (chunk: AdminChatCustomEvent) => void;
};

// The bound model is built once per turn in runAdminChatLoop (not per graph
// step) and threaded in via configurable, the same way apps/ai-assistant's
// buildModelInvoker avoids rebuilding + re-binding tools on every pass
// through the agent<->tools loop.
async function agentNode(
  state: AdminAgentStateType,
  config?: AdminChatNodeConfig
): Promise<{ messages: BaseMessage[]; data: AdminAgentData }> {
  const boundModel = config?.configurable?.boundModel;
  if (!boundModel) throw new Error("admin_chat.missing_bound_model");

  const stream = await boundModel.stream([new SystemMessage(ADMIN_CHAT_SYSTEM_PROMPT.text), ...state.messages], config);
  let full: AIMessageChunk | undefined;
  for await (const chunk of stream) {
    if (typeof chunk.content === "string" && chunk.content) {
      config?.writer?.({ kind: "text_delta", text: chunk.content });
    }
    full = full ? full.concat(chunk) : chunk;
  }

  return {
    messages: [full ?? new AIMessage({ content: "" })],
    data: { ...state.data, toolCallCount: state.data.toolCallCount + 1 }
  };
}

function routeAfterAgent(state: AdminAgentStateType): "tools" | "verify" {
  if (state.data.toolCallCount < MAX_STEPS && toolsCondition(state) === "tools") return "tools";
  return "verify";
}

// The generator (agent <-> tools) proposes a turn; this is the critic that
// checks it before it ever reaches the operator. Reproduced live in
// production: a 3-tool-call turn ("search the order, check its allowed
// transitions, get its details") ended with the model emitting neither a
// tool call nor any text - the turn completed in total silence and the
// operator's "change it to processing" request was simply dropped, twice.
// A single-tool-call turn is deliberately exempt (see loop.test.ts's
// "leaves finalMessage empty..." test) - its artifact can legitimately be
// self-explanatory, so there is nothing here worth second-guessing.
async function verifyNode(state: AdminAgentStateType, config?: AdminChatNodeConfig): Promise<{ messages: BaseMessage[]; data: AdminAgentData }> {
  const lastMessage = state.messages[state.messages.length - 1];
  // AIMessageChunk (what agentNode always produces, even for the "final"
  // pass - it's never upgraded to a plain AIMessage) only *implements* the
  // AIMessage interface for typing purposes; at runtime it extends
  // BaseMessageChunk, not AIMessage, so `instanceof AIMessage` is always
  // false here. .getType() is the version-proof way to ask "is this an AI
  // turn" regardless of chunk vs. non-chunk class identity.
  const isAiMessage = lastMessage?.getType?.() === "ai";
  const draftText = isAiMessage && typeof lastMessage.content === "string" ? lastMessage.content.trim() : "";
  const toolMessages = state.messages.filter((message): message is ToolMessage => message instanceof ToolMessage);
  const forcedCutoffWithPendingCall = isAiMessage && Array.isArray((lastMessage as AIMessage).tool_calls) && (lastMessage as AIMessage).tool_calls!.length > 0;
  const canRetry = state.data.verifyRetries < 1;

  if (toolMessages.length <= 1 && !forcedCutoffWithPendingCall) {
    return { messages: [], data: { ...state.data, verifyDecision: "final" } };
  }

  // Layer 1 - deterministic, free: a complex turn that produced no visible
  // text is never intentional (unlike the single-tool-call case above).
  if (!draftText) {
    if (canRetry) {
      return {
        messages: [
          new HumanMessage(
            "[reviewer] Your last reply had no text. If the tool results above already give you what you need, finish the request now - call the tool that actually completes it, or reply with a clear explanation. Do not stop silently."
          )
        ],
        data: { ...state.data, verifyRetries: state.data.verifyRetries + 1, verifyDecision: "retry" }
      };
    }
    const lastTool = toolMessages.at(-1);
    const recap = typeof lastTool?.content === "string" && lastTool.content ? ` Here is what I found: ${lastTool.content}` : "";
    return { messages: [new AIMessage(`I could not finish that request.${recap}`)], data: { ...state.data, verifyDecision: "final" } };
  }

  // Layer 2 - one bounded LLM critique pass, only for turns complex enough
  // (>1 tool call) that something could plausibly be wrong with a
  // non-empty draft - a single-lookup turn has nothing worth the extra
  // model call.
  const criticModel = config?.configurable?.criticModel;
  if (!canRetry || !criticModel) {
    return { messages: [], data: { ...state.data, verifyDecision: "final" } };
  }

  const lastRequest = [...state.messages]
    .reverse()
    .find((message): message is HumanMessage => message instanceof HumanMessage && typeof message.content === "string" && !message.content.startsWith("[reviewer]"));
  const requestText = lastRequest && typeof lastRequest.content === "string" ? lastRequest.content : "";
  const trace = toolMessages
    .map((message) => `- ${typeof message.name === "string" ? message.name : "tool"}: ${typeof message.content === "string" ? message.content : ""}`)
    .join("\n");

  let verdict: { ok: boolean; feedback: string };
  try {
    verdict = await criticModel.invoke([
      new SystemMessage(CRITIC_SYSTEM_TEXT),
      new HumanMessage(`Operator asked: ${requestText}\n\nTools called this turn:\n${trace}\n\nDraft reply:\n${draftText}`)
    ]);
  } catch {
    // A broken critic call must never block an otherwise-fine draft reply
    // from reaching the operator - fail open, not closed.
    return { messages: [], data: { ...state.data, verifyDecision: "final" } };
  }

  if (verdict.ok) {
    return { messages: [], data: { ...state.data, verifyDecision: "final" } };
  }

  return {
    messages: [new HumanMessage(`[reviewer] ${verdict.feedback}`)],
    data: { ...state.data, verifyRetries: state.data.verifyRetries + 1, verifyDecision: "retry" }
  };
}

const adminAgentGraph = new StateGraph(AdminAgentState)
  .addNode("agent", agentNode)
  .addNode("tools", new ToolNode(ADMIN_CHAT_LANGCHAIN_TOOLS))
  .addNode("verify", verifyNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", routeAfterAgent, { tools: "tools", verify: "verify" })
  .addEdge("tools", "agent")
  .addConditionalEdges("verify", (state: AdminAgentStateType) => (state.data.verifyDecision === "retry" ? "agent" : END), { agent: "agent", [END]: END })
  .compile(); // No checkpointer - conversation history is persisted at the
              // app level (admin_chat_messages), same as apps/ai-assistant's
              // own agentGraph, which drops LangGraph checkpointing for the
              // identical reason.

// The hand-written translator from LangGraph's stream chunks to this app's
// own LoopEvent vocabulary - routes/admin-chat.ts depends only on this
// contract, never on LangGraph's types directly, so the SSE route and the
// entire frontend needed zero changes for this migration.
export async function* runAdminChatLoop(ctx: AdminChatContext, history: BaseMessage[]): AsyncGenerator<LoopEvent> {
  const model = resolveChatModel(ctx.env);
  if (!model || !model.bindTools) {
    yield { type: "error", message: "Aether Chat is not configured on this environment." };
    return;
  }
  const boundModel = model.bindTools(ADMIN_CHAT_LANGCHAIN_TOOLS) as Runnable<BaseMessage[], AIMessageChunk>;
  const criticModel = model.withStructuredOutput(CriticVerdictSchema) as Runnable<BaseMessage[], { ok: boolean; feedback: string }>;

  yield { type: "status", phase: "analyzing" };

  let currentStepText = "";
  let finalText = "";
  let hadToolResult = false;

  try {
    const stream = await adminAgentGraph.stream(
      { messages: history, data: { ctx, toolCallCount: 0, verifyRetries: 0, verifyDecision: "pending" } },
      { configurable: { boundModel, criticModel }, streamMode: ["updates", "custom"] }
    );

    for await (const [mode, payload] of stream as AsyncIterable<["updates" | "custom", unknown]>) {
      if (mode === "custom") {
        const event = payload as AdminChatCustomEvent;
        if (event.kind === "text_delta") {
          currentStepText += event.text;
          yield { type: "text_delta", text: event.text };
        } else if (event.kind === "status") {
          yield { type: "status", phase: event.phase };
        }
        continue;
      }

      const update = payload as { agent?: { messages: BaseMessage[] }; tools?: { messages: BaseMessage[] }; verify?: { messages: BaseMessage[] } };

      if (update.tools?.messages) {
        hadToolResult = true;
        for (const message of update.tools.messages) {
          if (!(message instanceof ToolMessage)) continue;
          yield {
            type: "tool_result",
            toolName: typeof message.name === "string" ? message.name : "unknown_tool",
            message: typeof message.content === "string" ? message.content : "",
            artifact: (message.artifact ?? { type: "text" }) as ChatArtifact
          };
        }
      }

      if (update.agent?.messages) {
        const [response] = update.agent.messages;
        // response is always an AIMessageChunk here, which only implements
        // (not extends) AIMessage - .getType() is the check that actually
        // works for both chunk and non-chunk instances, see verifyNode.
        const toolCalls = response?.getType?.() === "ai" ? (response as AIMessage).tool_calls : undefined;
        const isTerminal = !toolCalls || toolCalls.length === 0;
        if (isTerminal) finalText = currentStepText;
        currentStepText = "";
      }

      // verifyNode's own AIMessage (the "I could not finish that request..."
      // fallback) never streams as text_delta - it's built synchronously,
      // not from the model - so it has to be picked up here explicitly or
      // it would never reach finalText/the completed event at all.
      if (update.verify?.messages) {
        const [response] = update.verify.messages;
        if (response?.getType?.() === "ai" && typeof response.content === "string" && response.content) {
          finalText = response.content;
        }
      }
    }
  } catch (error) {
    yield { type: "error", message: error instanceof Error ? error.message : "Aether Chat hit an unexpected error." };
    return;
  }

  // A turn that produced neither closing text nor any tool result (a
  // genuinely empty model response) must not complete silently - the
  // client has nothing to show for a request that visibly took time.
  if (!finalText && !hadToolResult) {
    finalText = "I didn't get a usable response that time - try asking again.";
  }

  yield { type: "completed", finalMessage: finalText };
}
