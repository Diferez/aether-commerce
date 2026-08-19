import type { AdminChatContext } from "./context";

export type ExecutorResult =
  | { success: true; result: Record<string, unknown> }
  | { success: false; code: string; message: string };

// Runs the real mutation for a confirmed pending action. Only ever invoked
// by POST /admin/chat/actions/:operationId/confirm, after the pending row
// has been atomically claimed - never by a tool's own run(), and never
// reachable by the model directly (there is no "execute_*" tool).
export type PendingActionExecutor = (ctx: AdminChatContext, params: Record<string, unknown>) => Promise<ExecutorResult>;
