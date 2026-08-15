import type { z } from "zod";
import { hasPermission, isDemoMutationBlocked } from "@aether/core";
import type { Permission } from "@aether/schemas";
import type { AdminChatContext } from "./context";
import type { ChatArtifact } from "./artifacts";

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
        return errorResult("MUTATIONS_DISABLED", "Mutations are temporarily disabled for Aether Chat.");
      }
      if (isDemoMutationBlocked(ctx.actor, spec.requires?.mutation ? "POST" : "GET")) {
        return errorResult("DEMO_MODE", "Public demo mode. Changes are disabled.");
      }
      if (spec.requires?.permission && !hasPermission(ctx.actor, spec.requires.permission)) {
        return errorResult("FORBIDDEN", `You do not have the "${spec.requires.permission}" permission needed for this.`);
      }

      const parsed = spec.schema.safeParse(rawArgs);
      if (!parsed.success) {
        return errorResult("INVALID_ARGUMENTS", "That request was missing required information.");
      }

      try {
        return await spec.run(parsed.data, ctx);
      } catch (error) {
        return errorResult("TOOL_FAILED", error instanceof Error ? error.message : "I could not complete that action right now.");
      }
    }
  };
}
