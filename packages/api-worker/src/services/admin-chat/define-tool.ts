import type { z } from "zod";
import { hasPermission, isDemoMutationBlocked, OBSERVABILITY_EVENTS } from "@aether/core";
import type { Permission } from "@aether/schemas";
import type { AdminChatContext } from "./context";
import type { ChatArtifact } from "./artifacts";
import { getLogger } from "../observability";
import { pick } from "./language";

export type ToolRequirements = { permission?: Permission; mutation?: boolean };

export type ToolResult = { message: string; artifact: ChatArtifact };

export type AdminChatToolSpec<Schema extends z.ZodType> = {
  name: string;
  description: string;
  schema: Schema;
  requires?: ToolRequirements;
  run: (args: z.infer<Schema>, ctx: AdminChatContext) => Promise<ToolResult>;
};

export type AdminChatTool = {
  name: string;
  description: string;
  schema: z.ZodType;
  requires?: ToolRequirements | undefined;
  run: (rawArgs: unknown, ctx: AdminChatContext) => Promise<ToolResult>;
};

function errorResult(code: string, message: string): ToolResult {
  return { message, artifact: { type: "error", code, message } };
}

// Every "that record doesn't exist" case across the tools (open_order,
// get_product_details, prepare_order_status_change, its matching executor,
// ...) used to repeat the same bilingual message inline just for a
// different entity name - concise as a one-liner in English only, but
// heavy enough once bilingual to read as duplicated code across files, not
// just a similar shape (flagged by SonarCloud's duplication check on this
// PR). Every entity name used here is grammatically masculine/invariant in
// Spanish ("ese pedido", "ese producto", "ese cliente"), so no gender
// parameter is needed. Exported as a plain string too (not just wrapped in
// a ToolResult) since a PendingActionExecutor's failure shape is `{success:
// false, code, message}`, not a ToolResult - it still needs the exact same
// bilingual text.
export function notFoundMessage(ctx: Pick<AdminChatContext, "language">, entityEn: string, entityEs: string): string {
  return pick(ctx.language, `${capitalize(entityEn)} not found.`, `${capitalize(entityEs)} no encontrado.`);
}

export function notFoundResult(ctx: Pick<AdminChatContext, "language">, code: string, entityEn: string, entityEs: string): ToolResult {
  return errorResult(code, notFoundMessage(ctx, entityEn, entityEs));
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// This repo's analogue of apps/ai-assistant/worker.ts's defineAssistantTool:
// every tool's precondition check, arg validation, and error boundary go
// through one place so the model can never bypass a permission check just by
// phrasing a request differently. Permission/demo/mutation-kill-switch
// checks reuse the exact same functions requirePermission uses on the plain
// REST admin routes (hasPermission, isDemoMutationBlocked from @aether/core)
// - independent of anything the model claims about itself.
export function defineAdminChatTool<Schema extends z.ZodType>(spec: AdminChatToolSpec<Schema>): AdminChatTool {
  return {
    name: spec.name,
    description: spec.description,
    schema: spec.schema,
    requires: spec.requires,
    async run(rawArgs, ctx) {
      if (spec.requires?.mutation && ctx.env.ADMIN_CHAT_MUTATIONS_ENABLED === "false") {
        return errorResult(
          "MUTATIONS_DISABLED",
          pick(
            ctx.language,
            `Mutations are temporarily disabled for ${ctx.env.AI_ASSISTANT_NAME ?? "Aether Chat"}.`,
            `Las modificaciones están deshabilitadas temporalmente en ${ctx.env.AI_ASSISTANT_NAME ?? "Aether Chat"}.`
          )
        );
      }
      if (isDemoMutationBlocked(ctx.actor, spec.requires?.mutation ? "POST" : "GET")) {
        return errorResult("DEMO_MODE", pick(ctx.language, "Public demo mode. Changes are disabled.", "Modo de demostración pública. Los cambios están deshabilitados."));
      }
      if (spec.requires?.permission && !hasPermission(ctx.actor, spec.requires.permission)) {
        return errorResult(
          "FORBIDDEN",
          pick(
            ctx.language,
            `You do not have the "${spec.requires.permission}" permission needed for this.`,
            `No tienes el permiso "${spec.requires.permission}" necesario para esto.`
          )
        );
      }

      const parsed = spec.schema.safeParse(rawArgs);
      if (!parsed.success) {
        return errorResult("INVALID_ARGUMENTS", pick(ctx.language, "That request was missing required information.", "A esa solicitud le faltaba información necesaria."));
      }

      try {
        return await spec.run(parsed.data, ctx);
      } catch (error) {
        // ai-assistant's defineAssistantTool logs this same class of
        // failure (logAgentObservability({type:"tool_exception", ...})) -
        // admin-chat's own tool boundary had no equivalent, so a real tool
        // failure here was only ever visible by querying admin_chat_messages
        // directly, after the fact.
        getLogger(ctx.env).error(OBSERVABILITY_EVENTS.adminChatToolFailed, {
          requestId: ctx.requestId,
          metadata: { toolName: spec.name, conversationId: ctx.conversationId },
          error
        });
        return errorResult("TOOL_FAILED", error instanceof Error ? error.message : pick(ctx.language, "I could not complete that action right now.", "No pude completar esa acción en este momento."));
      }
    }
  };
}
