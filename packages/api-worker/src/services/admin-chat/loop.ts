import { z } from "zod";
import { Annotation, Command, END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import type { Runnable, RunnableConfig } from "@langchain/core/runnables";
import type { AdminChatContext } from "./context";
import type { ChatArtifact } from "./artifacts";
import { ADMIN_CHAT_LANGCHAIN_TOOLS, type AdminChatCustomEvent } from "./registry";
import { isGeminiQuotaError, resolveChatModelChain } from "../ai-provider";
import { ADMIN_CHAT_SYSTEM_PROMPT } from "../../prompts/admin-chat-system-prompt";

// Bounds how many agent -> tools -> agent passes a single turn can take
// before forcing a final answer - mirrors apps/ai-assistant's
// MAX_AGENT_STEPS, sized a little higher since an admin request can
// reasonably need 2 reads before a prepare. routeAfterAgent below extends
// this further, by exactly enough to let a verify-triggered retry (see
// verifyNode) actually call the tool it flagged as missing, rather than
// just adding headroom here that the routing check doesn't actually honor.
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

const criticSystemText = (assistantName: string) => `You are a strict quality reviewer for ${assistantName}, an internal admin assistant. You will be shown recent conversation context, what the operator just asked, which tools the assistant called this turn and what each returned, and the assistant's draft reply (which may be empty). Judge only whether this turn actually resolves the operator's current request:
- An empty draft reply is FINE when the tool results already fully show what was asked (a list, a card, a confirmed change) - never penalize brevity or silence by itself.
- An empty draft reply is a FAILURE when a tool call errored and nothing explains it, or when the operator clearly asked for something that still has not happened.
- If the operator's wording refers to more than one record (plural pronouns like "them"/"las"/"los", "both", "all", or a list shown earlier in the conversation) but the tools called this turn - or the draft reply - only address one of them, that is a failure: say specifically which other record(s) still need action.
- If the operator asked for something to change (a status, a price, stock, etc.) and no prepare_* tool was called for every record that needed it, that is a failure unless the draft reply clearly explains why.
- If the draft reply contradicts or ignores information already returned by a tool, that is a failure.
Respond only through the structured schema you were given.`;

// LangGraph node config carries a `writer` callback for "custom" stream
// mode - verified live against the installed @langchain/langgraph version
// that this, not @langchain/core's dispatchCustomEvent, is what actually
// reaches a caller using streamMode including "custom" (dispatchCustomEvent
// relies on a callback manager that isn't wired up in a bare graph.stream()
// call here; config.writer is LangGraph's own native channel for exactly
// this and needed no extra wiring). Only "status" events go through it now -
// token streaming used to as well, replaced by streamMode:"messages" (see
// runAdminChatLoop and agentNode below).
type AdminChatNodeConfig = RunnableConfig & {
  configurable?: {
    // Primary first, then fallbacks - see ai-provider/index.ts's
    // resolveChatModelChain. A Gemini quota is per-model, not per-account,
    // so a 429 on the first entry doesn't mean the API is down; it means
    // trying the next entry is worth it before failing the whole turn.
    boundModels?: Runnable<BaseMessage[], AIMessageChunk>[];
    criticModels?: Runnable<BaseMessage[], { ok: boolean; feedback: string }>[];
  };
  writer?: (chunk: AdminChatCustomEvent) => void;
};

// Tries each candidate in order, falling through only on a quota-shaped
// error (mirrors apps/ai-assistant/worker.ts's buildModelInvoker) - any
// other failure would fail identically on a fallback model too, so it
// surfaces immediately instead of masking it behind a second failed call.
async function invokeWithFallback<T>(candidates: T[] | undefined, call: (candidate: T) => Promise<unknown>): Promise<unknown> {
  if (!candidates || candidates.length === 0) throw new Error("admin_chat.missing_bound_model");
  let lastError: unknown;
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      return await call(candidates[index] as T);
    } catch (error) {
      lastError = error;
      if (!isGeminiQuotaError(error) || index === candidates.length - 1) throw error;
    }
  }
  throw lastError;
}

// The bound models are built once per turn in runAdminChatLoop (not per
// graph step) and threaded in via configurable, the same way apps/
// ai-assistant's buildModelInvoker avoids rebuilding + re-binding tools on
// every pass through the agent<->tools loop.
//
// Still calls .stream() and accumulates chunks itself (rather than
// .invoke()) to build the final message this node returns to graph state -
// but no longer manually re-emits each chunk through config.writer. Token
// deltas now reach the operator via LangGraph's own streamMode:"messages"
// (see runAdminChatLoop), which - confirmed live against two real Gemini
// calls, one through a plain node and one through a multi-node graph with a
// second .invoke()-based model call - picks up every model invocation
// inside a node automatically, no custom-event wiring needed at all.
async function agentNode(
  state: AdminAgentStateType,
  config?: AdminChatNodeConfig
): Promise<{ messages: BaseMessage[]; data: AdminAgentData }> {
  const systemPromptText = ADMIN_CHAT_SYSTEM_PROMPT.text
    .replaceAll("{{ASSISTANT_NAME}}", state.data.ctx.env.AI_ASSISTANT_NAME ?? "Aether Chat")
    .replaceAll("{{BRAND_NAME}}", state.data.ctx.env.BRAND_NAME ?? "Aether");
  const messages = [new SystemMessage(systemPromptText), ...state.messages];
  const stream = (await invokeWithFallback(config?.configurable?.boundModels, (model) => model.stream(messages, config))) as AsyncIterable<AIMessageChunk>;
  let full: AIMessageChunk | undefined;
  for await (const chunk of stream) {
    full = full ? full.concat(chunk) : chunk;
  }

  return {
    messages: [full ?? new AIMessage({ content: "" })],
    data: { ...state.data, toolCallCount: state.data.toolCallCount + 1 }
  };
}

// Real production bug found live: a "Pásalas a procesando" (plural mutation)
// turn spent 4 tool calls on reads, then on its 5th pass wanted to call
// prepare_order_status_change - toolCallCount had just reached MAX_STEPS, so
// routeAfterAgent sent it to "verify" instead of "tools" (the call never
// ran), verifyNode's forcedCutoffWithPendingCall path correctly nudged it to
// try again... and the retry's own prepare_order_status_change call *also*
// never ran, because toolCallCount had incremented to MAX_STEPS+1 by then
// while the check below only compared against a flat MAX_STEPS. No matter
// how many times the model tried, its mutation call could never reach
// "tools" again - the turn always ended in the deterministic "I could not
// finish that request" fallback despite the model doing exactly what the
// nudge asked. The pass that gets blocked still costs a toolCallCount
// increment even though it never reaches "tools" - so a nudge's retry needs
// TWO extra units of budget (one for the blocked pass that triggered the
// nudge, one for the retry pass itself), not one. verifyNode's own canRetry
// bounds verifyRetries to at most 1, so this never grows unbounded.
function routeAfterAgent(state: AdminAgentStateType): "tools" | "verify" {
  const budget = MAX_STEPS + 2 * state.data.verifyRetries;
  if (state.data.toolCallCount < budget && toolsCondition(state) === "tools") return "tools";
  return "verify";
}

// The generator (agent <-> tools) proposes a turn; this is the critic that
// checks it before it ever reaches the operator. Two real production bugs
// shaped this:
// (1) a 3-tool-call turn ("search the order, check its allowed transitions,
//     get its details") ended with the model emitting neither a tool call
//     nor any text - total silence, the operator's request just dropped.
// (2) the first fix for (1) overcorrected: a *different* 3-tool-call turn
//     (search, open, get details - all successful, nothing left to say)
//     got wrongly flagged as a failure too, because that fix treated any
//     empty text after >1 tool call as broken. Emptiness alone was never
//     the real signal - whether the turn actually resolved the request is,
//     which is a judgment call, not a deterministic check. So the critic is
//     now the primary mechanism for every complex turn (empty draft or
//     not), with a cheap deterministic fallback only when no critic call is
//     available. A single-tool-call turn is still exempt (see loop.test.ts's
//     "leaves finalMessage empty..." test) - its artifact can legitimately
//     be self-explanatory, so there is nothing here worth a model call over.
//
// Returns Command directly (goto + state update together) instead of a
// plain node return plus a separate addConditionalEdges call - this was
// the one place in the graph where routing was a real decision made
// *inside* the node (based on a critic verdict fetched here), so keeping
// that decision and the update it produces in the same return value avoids
// re-deriving it from a state field a second time in a router function.
async function verifyNode(state: AdminAgentStateType, config?: AdminChatNodeConfig): Promise<Command> {
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
  const complex = toolMessages.length > 1 || forcedCutoffWithPendingCall;

  if (!complex) {
    return new Command({ goto: END });
  }

  // Hit the step budget with a tool call still queued - there's no draft to
  // critique yet, just an unfinished plan. Nudge once if there's budget
  // left; otherwise it falls through to the same never-end-in-silence
  // fallback every other complex turn gets below.
  if (forcedCutoffWithPendingCall && canRetry) {
    return new Command({
      update: {
        messages: [
          new HumanMessage(
            "[reviewer] You ran out of steps mid-plan. Using only what you already know from the results above, finish the request now with a real reply - call the tool that actually completes it, or give a clear explanation."
          )
        ],
        data: { ...state.data, verifyRetries: state.data.verifyRetries + 1 }
      },
      goto: "agent"
    });
  }

  const criticModels = config?.configurable?.criticModels;
  if (!canRetry || !criticModels || criticModels.length === 0) {
    // No budget or no critic configured - fall back to the cheap, blunt
    // guard: never let a genuinely empty reply reach the operator in
    // silence. A non-empty draft is accepted as-is here even if imperfect,
    // rather than looping forever chasing a perfect answer.
    if (!draftText) {
      const lastTool = toolMessages.at(-1);
      const recap = typeof lastTool?.content === "string" && lastTool.content ? ` Here is what I found: ${lastTool.content}` : "";
      return new Command({ update: { messages: [new AIMessage(`I could not finish that request.${recap}`)] }, goto: END });
    }
    return new Command({ goto: END });
  }

  // Recent context (not just the current message) matters for judging
  // completeness - "cámbialas" (plural, "change them") only resolves to
  // "both orders" if the critic can see the earlier turn that listed both.
  // history/state.messages only ever carries clean human/ai text turns
  // across turn boundaries (see routes/admin-chat.ts's loadHistory), so
  // this filter naturally excludes every tool call and every mid-turn
  // "[reviewer]" nudge without needing to track turn boundaries explicitly.
  const cleanTurns = state.messages.filter(
    (message) =>
      (message.getType() === "human" || message.getType() === "ai") &&
      typeof message.content === "string" &&
      message.content.trim().length > 0 &&
      !message.content.startsWith("[reviewer]")
  );
  const lastRequest = [...cleanTurns].reverse().find((message) => message.getType() === "human");
  const requestText = typeof lastRequest?.content === "string" ? lastRequest.content : "";
  const contextText = cleanTurns
    .filter((message) => message !== lastRequest)
    .slice(-6)
    .map((message) => `${message.getType() === "human" ? "Operator" : "Assistant"}: ${typeof message.content === "string" ? message.content : ""}`)
    .join("\n");
  const trace = toolMessages
    .map((message) => `- ${typeof message.name === "string" ? message.name : "tool"}: ${typeof message.content === "string" ? message.content : ""}`)
    .join("\n");

  const criticMessages = [
    new SystemMessage(criticSystemText(state.data.ctx.env.AI_ASSISTANT_NAME ?? "Aether Chat")),
    new HumanMessage(
      `Recent conversation:\n${contextText || "(none)"}\n\nOperator just asked: ${requestText}\n\nTools called this turn:\n${trace}\n\nDraft reply:\n${draftText || "(empty - no closing text)"}`
    )
  ];
  let verdict: { ok: boolean; feedback: string };
  try {
    verdict = (await invokeWithFallback(criticModels, (model) => model.invoke(criticMessages))) as { ok: boolean; feedback: string };
  } catch {
    // A broken critic call must never block an otherwise-fine draft reply
    // from reaching the operator - fail open, not closed.
    return new Command({ goto: END });
  }

  if (verdict.ok) {
    return new Command({ goto: END });
  }

  return new Command({
    update: {
      messages: [new HumanMessage(`[reviewer] ${verdict.feedback}`)],
      data: { ...state.data, verifyRetries: state.data.verifyRetries + 1 }
    },
    goto: "agent"
  });
}

const adminAgentGraph = new StateGraph(AdminAgentState)
  .addNode("agent", agentNode)
  // Most tool-level failures (D1 errors, permission denials, not-found)
  // never reach here - defineAdminChatTool's own try/catch already turns
  // them into a graceful ToolResult, not a thrown exception, specifically
  // so the model can react to a real message instead of the turn dying.
  // This retryPolicy is a safety net for what's left: a genuine throw
  // outside that boundary (e.g. the model producing tool-call arguments
  // that fail LangChain's own schema validation before defineAdminChatTool
  // ever runs). Two attempts, LangGraph's default backoff/retryOn (skips
  // 4xx-shaped and cancellation errors) - never retries the errors that
  // are already handled gracefully, because those never throw in the
  // first place.
  .addNode("tools", new ToolNode(ADMIN_CHAT_LANGCHAIN_TOOLS), { retryPolicy: { maxAttempts: 2 } })
  // verifyNode routes itself via the Command it returns (goto: "agent" or
  // END) rather than a separate addConditionalEdges call - `ends` just
  // declares the possible destinations so the graph can still validate/
  // visualize them.
  .addNode("verify", verifyNode, { ends: ["agent", END] })
  .addEdge(START, "agent")
  .addConditionalEdges("agent", routeAfterAgent, { tools: "tools", verify: "verify" })
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
  const models = await resolveChatModelChain(ctx.env);
  if (!models || models.length === 0 || !models[0]?.bindTools) {
    yield { type: "error", message: `${ctx.env.AI_ASSISTANT_NAME ?? "Aether Chat"} is not configured on this environment.` };
    return;
  }
  const boundModels = models.map((candidate) => candidate.bindTools!(ADMIN_CHAT_LANGCHAIN_TOOLS) as Runnable<BaseMessage[], AIMessageChunk>);
  const criticModels = models.map((candidate) => candidate.withStructuredOutput(CriticVerdictSchema) as Runnable<BaseMessage[], { ok: boolean; feedback: string }>);

  yield { type: "status", phase: "analyzing" };

  let currentStepText = "";
  let finalText = "";
  let hadToolResult = false;

  try {
    const stream = await adminAgentGraph.stream(
      { messages: history, data: { ctx, toolCallCount: 0, verifyRetries: 0 } },
      { configurable: { boundModels, criticModels }, streamMode: ["updates", "custom", "messages"] }
    );

    for await (const [mode, payload] of stream as AsyncIterable<["updates" | "custom" | "messages", unknown]>) {
      if (mode === "custom") {
        const event = payload as AdminChatCustomEvent;
        if (event.kind === "status") {
          yield { type: "status", phase: event.phase };
        }
        continue;
      }

      // "messages" streams every genuine model call inside every node, not
      // just agentNode's - confirmed live against a real Gemini call that
      // verifyNode's critic (a plain .invoke(), not even .stream()) shows up
      // here too, streaming its raw structured-output text chunk by chunk.
      // Filtering by metadata.langgraph_node is what keeps that from ever
      // reaching the operator as if it were the assistant's own reply.
      // Deliberately no unit test for this exact leak: it only reproduces
      // against a real network-backed model actually streaming a response -
      // every offline fake tried (a plain object, and
      // @langchain/core/testing's fakeModel().withStructuredOutput()) simply
      // never emits a "messages" event for the critic's call at all, so a
      // test built on either would pass whether or not this filter exists.
      // The filter itself is still correct and required; it's just verified
      // by that live spike, not by anything that runs in CI.
      if (mode === "messages") {
        const [chunk, metadata] = payload as [AIMessageChunk, { langgraph_node?: string }];
        if (metadata?.langgraph_node === "agent" && typeof chunk.content === "string" && chunk.content) {
          currentStepText += chunk.content;
          yield { type: "text_delta", text: chunk.content };
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
    yield { type: "error", message: error instanceof Error ? error.message : `${ctx.env.AI_ASSISTANT_NAME ?? "Aether Chat"} hit an unexpected error.` };
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
