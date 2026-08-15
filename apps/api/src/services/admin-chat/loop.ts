import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { AIMessage, SystemMessage, ToolMessage, type AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import type { Runnable, RunnableConfig } from "@langchain/core/runnables";
import type { AdminChatContext } from "./context";
import type { ChatArtifact } from "./artifacts";
import { ADMIN_CHAT_LANGCHAIN_TOOLS, type AdminChatCustomEvent } from "./registry";
import { resolveChatModel } from "../ai-provider";
import { ADMIN_CHAT_SYSTEM_PROMPT } from "../../prompts/admin-chat-system-prompt";

// Bounds how many agent -> tools -> agent passes a single turn can take
// before forcing a final answer - mirrors apps/ai-assistant's
// MAX_AGENT_STEPS, sized a little higher since an admin request can
// reasonably need 2 reads before a prepare.
const MAX_STEPS = 4;

export type LoopEvent =
  | { type: "status"; phase: "analyzing" | "consulting" | "preparing" | "executing" }
  | { type: "text_delta"; text: string }
  | { type: "tool_result"; toolName: string; message: string; artifact: ChatArtifact }
  | { type: "completed"; finalMessage: string }
  | { type: "error"; message: string };

type AdminAgentData = { ctx: AdminChatContext; toolCallCount: number };

const AdminAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: (left, right) => left.concat(right), default: () => [] }),
  data: Annotation<AdminAgentData>()
});

type AdminAgentStateType = { messages: BaseMessage[]; data: AdminAgentData };

// LangGraph node config carries a `writer` callback for "custom" stream
// mode - verified live against the installed @langchain/langgraph version
// that this, not @langchain/core's dispatchCustomEvent, is what actually
// reaches a caller using streamMode:["updates","custom"] (dispatchCustomEvent
// relies on a callback manager that isn't wired up in a bare graph.stream()
// call here; config.writer is LangGraph's own native channel for exactly
// this and needed no extra wiring).
type AdminChatNodeConfig = RunnableConfig & {
  configurable?: { boundModel?: Runnable<BaseMessage[], AIMessageChunk> };
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

function routeAfterAgent(state: AdminAgentStateType): "tools" | typeof END {
  if (state.data.toolCallCount >= MAX_STEPS) return END;
  return toolsCondition(state) === "tools" ? "tools" : END;
}

const adminAgentGraph = new StateGraph(AdminAgentState)
  .addNode("agent", agentNode)
  .addNode("tools", new ToolNode(ADMIN_CHAT_LANGCHAIN_TOOLS))
  .addEdge(START, "agent")
  .addConditionalEdges("agent", routeAfterAgent, { tools: "tools", [END]: END })
  .addEdge("tools", "agent")
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

  yield { type: "status", phase: "analyzing" };

  let currentStepText = "";
  let finalText = "";
  let hadToolResult = false;

  try {
    const stream = await adminAgentGraph.stream(
      { messages: history, data: { ctx, toolCallCount: 0 } },
      { configurable: { boundModel }, streamMode: ["updates", "custom"] }
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

      const update = payload as { agent?: { messages: BaseMessage[] }; tools?: { messages: BaseMessage[] } };

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
        const isTerminal = !(response instanceof AIMessage) || !response.tool_calls || response.tool_calls.length === 0;
        if (isTerminal) finalText = currentStepText;
        currentStepText = "";
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
