import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { hasPermission, isDemoMutationBlocked, OBSERVABILITY_EVENTS } from "@aether/core";
import type { AppBindings } from "../types";
import { fail, ok } from "../http";
import { buildClientVisibleContext, type AdminChatContext } from "../services/admin-chat/context";
import { runAdminChatLoop, type LoopEvent } from "../services/admin-chat/loop";
import { sse } from "../services/admin-chat/sse";
import { claimPendingAction, resolvePendingAction } from "../services/admin-chat/pending-actions";
import { ADMIN_CHAT_EXECUTORS, ADMIN_CHAT_TOOLS_BY_NAME } from "../services/admin-chat/registry";
import { ADMIN_CHAT_SYSTEM_PROMPT } from "../prompts/admin-chat-system-prompt";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { getLogger } from "../services/observability";

export const adminChatRoutes = new Hono<AppBindings>();

const ADMIN_CHAT_ROLES = new Set(["support", "catalog_manager", "order_manager", "admin", "super_admin", "demo_viewer"]);

const requireAdminChatAccess: MiddlewareHandler<AppBindings> = async (c, next) => {
  const actor = c.get("actor");
  if (!actor.userId) {
    return fail(c, 401, "AUTH_REQUIRED", "Sign in before using Aether Admin Chat.");
  }
  if (!actor.roles.some((role) => ADMIN_CHAT_ROLES.has(role))) {
    return fail(c, 403, "FORBIDDEN", "An administrative role is required for Aether Admin Chat.");
  }
  await next();
};

adminChatRoutes.use("*", requireAdminChatAccess);

const chatMessageSchema = z.object({
  conversationId: z.string().min(1).optional(),
  message: z.string().min(1),
  context: z.unknown().optional()
});

type ConversationRow = { id: string; actor_id: string; status: string; system_prompt_version: string };
type MessageRow = { role: "user" | "assistant" | "tool"; content: string | null; tool_calls_json: string | null };

async function loadOrCreateConversation(env: AppBindings["Bindings"], actorId: string, conversationId?: string): Promise<ConversationRow> {
  if (conversationId) {
    const existing = await env.DB.prepare("select id, actor_id, status, system_prompt_version from admin_chat_conversations where id = ?")
      .bind(conversationId)
      .first<ConversationRow>();
    if (existing && existing.actor_id === actorId) return existing;
  }
  const id = `conv_${crypto.randomUUID()}`;
  await env.DB.prepare(
    "insert into admin_chat_conversations (id, actor_id, system_prompt_version) values (?, ?, ?)"
  )
    .bind(id, actorId, ADMIN_CHAT_SYSTEM_PROMPT.version)
    .run();
  return { id, actor_id: actorId, status: "active", system_prompt_version: ADMIN_CHAT_SYSTEM_PROMPT.version };
}

// Only clean user/assistant text turns are replayed back into the model as
// history - intermediate tool-call/tool-response pairs from earlier turns
// are not reconstructed. Gemini expects a model turn with a functionCall to
// be immediately followed by a matching function-response turn; replaying a
// partial reconstruction across separate HTTP requests risks a malformed
// history, so each turn's tool activity stays local to that turn's own loop
// invocation (see loop.ts) and only the final summary carries forward.
async function loadHistory(env: AppBindings["Bindings"], conversationId: string): Promise<BaseMessage[]> {
  const rows = await env.DB.prepare(
    "select role, content, tool_calls_json from admin_chat_messages where conversation_id = ? order by created_at asc"
  )
    .bind(conversationId)
    .all<MessageRow>();

  const history: BaseMessage[] = [];
  for (const row of rows.results || []) {
    if (row.role === "user" && row.content) {
      history.push(new HumanMessage(row.content));
    } else if (row.role === "assistant" && row.tool_calls_json === null && row.content) {
      history.push(new AIMessage(row.content));
    }
  }
  return history;
}

async function insertMessage(
  env: AppBindings["Bindings"],
  conversationId: string,
  role: "user" | "assistant" | "tool",
  content: string | null,
  toolCallsJson?: unknown
) {
  await env.DB.prepare(
    "insert into admin_chat_messages (id, conversation_id, role, content, tool_calls_json) values (?, ?, ?, ?, ?)"
  )
    .bind(crypto.randomUUID(), conversationId, role, content, toolCallsJson === undefined ? null : JSON.stringify(toolCallsJson))
    .run();
}

function inputTooLong(env: AppBindings["Bindings"], message: string): boolean {
  const max = Number(env.ADMIN_CHAT_MAX_INPUT_CHARACTERS || 4000) || 4000;
  return message.length > max;
}

adminChatRoutes.post("/messages/stream", zValidator("json", chatMessageSchema), async (c) => {
  const body = c.req.valid("json");
  const actor = c.get("actor");
  const actorId = actor.userId!;

  if (inputTooLong(c.env, body.message)) {
    return fail(c, 422, "MESSAGE_TOO_LONG", "That message is too long.");
  }

  const conversation = await loadOrCreateConversation(c.env, actorId, body.conversationId);
  const visible = buildClientVisibleContext(body.context);
  const history = await loadHistory(c.env, conversation.id);
  await insertMessage(c.env, conversation.id, "user", body.message);

  const ctx: AdminChatContext = { env: c.env, actor, requestId: c.get("requestId"), conversationId: conversation.id, visible };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(sse("chat.conversation", { conversationId: conversation.id }));
      getLogger(c.env).debug("admin_chat.stream_start", { requestId: ctx.requestId, metadata: { conversationId: conversation.id } });
      let finalMessage = "";
      try {
        for await (const event of runAdminChatLoop(ctx, [...history, new HumanMessage(body.message)])) {
          if (event.type === "status") {
            controller.enqueue(sse("chat.status", { phase: event.phase }));
          } else if (event.type === "text_delta") {
            controller.enqueue(sse("chat.text_delta", { text: event.text }));
          } else if (event.type === "tool_result") {
            controller.enqueue(sse("chat.tool_result", { toolName: event.toolName, message: event.message, artifact: event.artifact }));
            await insertMessage(c.env, conversation.id, "tool", event.message, { toolName: event.toolName, artifact: event.artifact });
          } else if (event.type === "error") {
            controller.enqueue(sse("chat.error", { message: event.message }));
          } else if (event.type === "completed") {
            finalMessage = event.finalMessage;
            controller.enqueue(sse("chat.completed", { message: event.finalMessage }));
          }
        }
      } catch (error) {
        getLogger(c.env).error(OBSERVABILITY_EVENTS.applicationUnhandledError, {
          requestId: ctx.requestId,
          metadata: { source: "admin_chat.stream" },
          error
        });
        controller.enqueue(sse("chat.error", { message: error instanceof Error ? error.message : "Aether Chat hit an unexpected error." }));
      } finally {
        getLogger(c.env).debug("admin_chat.stream_end", { requestId: ctx.requestId, metadata: { hasFinalMessage: Boolean(finalMessage) } });
        if (finalMessage) {
          await insertMessage(c.env, conversation.id, "assistant", finalMessage);
        }
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" } });
});

// Non-streaming variant: same turn, collected into one JSON payload. Used
// by tests and any client that can't consume SSE.
adminChatRoutes.post("/messages", zValidator("json", chatMessageSchema), async (c) => {
  const body = c.req.valid("json");
  const actor = c.get("actor");
  const actorId = actor.userId!;

  if (inputTooLong(c.env, body.message)) {
    return fail(c, 422, "MESSAGE_TOO_LONG", "That message is too long.");
  }

  const conversation = await loadOrCreateConversation(c.env, actorId, body.conversationId);
  const visible = buildClientVisibleContext(body.context);
  const history = await loadHistory(c.env, conversation.id);
  await insertMessage(c.env, conversation.id, "user", body.message);

  const ctx: AdminChatContext = { env: c.env, actor, requestId: c.get("requestId"), conversationId: conversation.id, visible };

  const toolResults: LoopEvent[] = [];
  let finalMessage = "";
  let errorMessage: string | null = null;

  for await (const event of runAdminChatLoop(ctx, [...history, new HumanMessage(body.message)])) {
    if (event.type === "tool_result") {
      toolResults.push(event);
      await insertMessage(c.env, conversation.id, "tool", event.message, { toolName: event.toolName, artifact: event.artifact });
    } else if (event.type === "completed") {
      finalMessage = event.finalMessage;
    } else if (event.type === "error") {
      errorMessage = event.message;
    }
  }

  if (finalMessage) {
    await insertMessage(c.env, conversation.id, "assistant", finalMessage);
  }

  if (errorMessage) {
    return fail(c, 503, "PROVIDER_ERROR", errorMessage);
  }

  return ok(c, {
    conversationId: conversation.id,
    message: finalMessage,
    toolResults: toolResults
      .filter((event): event is Extract<LoopEvent, { type: "tool_result" }> => event.type === "tool_result")
      .map((event) => ({ toolName: event.toolName, message: event.message, artifact: event.artifact }))
  });
});

adminChatRoutes.get("/conversations/:id", async (c) => {
  const actor = c.get("actor");
  const conversation = await c.env.DB.prepare("select id, actor_id, status, system_prompt_version, created_at from admin_chat_conversations where id = ?")
    .bind(c.req.param("id"))
    .first<ConversationRow & { created_at: string }>();
  if (!conversation || conversation.actor_id !== actor.userId) {
    return fail(c, 404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  }
  const messages = await c.env.DB.prepare(
    "select id, role, content, tool_calls_json, created_at from admin_chat_messages where conversation_id = ? order by created_at asc"
  )
    .bind(conversation.id)
    .all<{ id: string; role: string; content: string | null; tool_calls_json: string | null; created_at: string }>();

  return ok(c, {
    conversation,
    messages: (messages.results || []).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      toolCall: row.tool_calls_json ? (JSON.parse(row.tool_calls_json) as unknown) : null,
      createdAt: row.created_at
    }))
  });
});

adminChatRoutes.delete("/conversations/:id", async (c) => {
  const actor = c.get("actor");
  const conversation = await c.env.DB.prepare("select actor_id from admin_chat_conversations where id = ?")
    .bind(c.req.param("id"))
    .first<{ actor_id: string }>();
  if (!conversation || conversation.actor_id !== actor.userId) {
    return fail(c, 404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  }
  const conversationId = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("delete from admin_chat_pending_actions where conversation_id = ?").bind(conversationId),
    c.env.DB.prepare("delete from admin_chat_messages where conversation_id = ?").bind(conversationId),
    c.env.DB.prepare("delete from admin_chat_conversations where id = ?").bind(conversationId)
  ]);
  return ok(c, { id: conversationId, status: "deleted" });
});

adminChatRoutes.post("/actions/:operationId/confirm", async (c) => {
  const operationId = c.req.param("operationId");
  const actor = c.get("actor");
  const actorId = actor.userId!;

  const claim = await claimPendingAction(c.env, operationId, actorId);

  if (claim.kind === "not_found") return fail(c, 404, "OPERATION_NOT_FOUND", "This action was not found.");
  if (claim.kind === "forbidden") return fail(c, 403, "FORBIDDEN", "This action belongs to a different session.");
  if (claim.kind === "expired") {
    return fail(c, 409, "OPERATION_EXPIRED", "This preview has expired. Ask again for a fresh one.", { diff: claim.diff });
  }
  if (claim.kind === "replay") {
    return ok(c, { operationId, replay: true, ...claim.result });
  }

  const { row } = claim;
  const preparedTool = ADMIN_CHAT_TOOLS_BY_NAME[row.tool_name];
  if (!preparedTool) {
    await resolvePendingAction(c.env, operationId, { status: "failed", result: { code: "NO_TOOL", message: "This action has no tool definition." } });
    return fail(c, 500, "NO_TOOL", "This action has no tool definition.");
  }
  if (preparedTool.requires?.permission && !hasPermission(actor, preparedTool.requires.permission)) {
    await resolvePendingAction(c.env, operationId, { status: "failed", result: { code: "FORBIDDEN", message: "Your permission for this action is no longer valid." } });
    return fail(c, 403, "FORBIDDEN", "Your permission for this action is no longer valid.");
  }
  if (preparedTool.requires?.mutation && (c.env.ADMIN_CHAT_MUTATIONS_ENABLED === "false" || isDemoMutationBlocked(actor, "POST"))) {
    await resolvePendingAction(c.env, operationId, { status: "failed", result: { code: "MUTATIONS_DISABLED", message: "Mutations are disabled for this session." } });
    return fail(c, 403, "MUTATIONS_DISABLED", "Mutations are disabled for this session.");
  }
  const executor = ADMIN_CHAT_EXECUTORS[row.tool_name];
  if (!executor) {
    await resolvePendingAction(c.env, operationId, { status: "failed", result: { code: "NO_EXECUTOR", message: "This action has no executor." } });
    return fail(c, 500, "NO_EXECUTOR", "This action has no executor.");
  }

  const ctx: AdminChatContext = {
    env: c.env,
    actor,
    requestId: c.get("requestId"),
    conversationId: row.conversation_id,
    visible: {}
  };
  const params = JSON.parse(row.params_json) as Record<string, unknown>;
  const outcome = await executor(ctx, params);

  if (!outcome.success) {
    await resolvePendingAction(c.env, operationId, { status: "failed", result: { code: outcome.code, message: outcome.message } });
    return fail(c, 409, outcome.code, outcome.message);
  }

  await resolvePendingAction(c.env, operationId, { status: "confirmed", result: outcome.result });
  return ok(c, { operationId, replay: false, ...outcome.result }, 201);
});
