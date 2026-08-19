import { tool } from "@langchain/core/tools";
import type { AdminChatTool } from "./define-tool";
import type { AdminChatContext } from "./context";
import type { PendingActionExecutor } from "./executors";
import { navigateToTool, openProductTool, openOrderTool, openCustomerTool, focusFormFieldTool } from "./tools/navigation";
import { getDashboardSummaryTool, getRecentActivityTool, getStoreAlertsTool, getSalesSummaryTool } from "./tools/dashboard";
import { searchProductsTool, getProductDetailsTool, getLowStockProductsTool, getOutOfStockProductsTool } from "./tools/products";
import {
  prepareCreateProductTool,
  executeCreateProduct,
  prepareUpdateProductTool,
  executeUpdateProduct,
  prepareArchiveProductTool,
  executeArchiveProduct,
  prepareBulkProductUpdateTool,
  executeBulkProductUpdate,
  prepareInventoryAdjustmentTool,
  executeInventoryAdjustment
} from "./tools/products-mutations";
import {
  searchOrdersTool,
  getOrderDetailsTool,
  getOrdersByStatusTool,
  getPendingOrdersTool,
  getOrderTimelineTool,
  getAllowedOrderTransitionsTool
} from "./tools/orders";
import { prepareOrderStatusChangeTool, executeOrderStatusChange } from "./tools/orders-mutations";
import { searchCustomersTool, getCustomerDetailsTool, getCustomerOrderHistoryTool } from "./tools/customers";
import { getSystemHealthTool, getWebhookActivityTool } from "./tools/observability";

export const ADMIN_CHAT_TOOLS: AdminChatTool[] = [
  navigateToTool,
  openProductTool,
  openOrderTool,
  openCustomerTool,
  focusFormFieldTool,
  getDashboardSummaryTool,
  getRecentActivityTool,
  getStoreAlertsTool,
  getSalesSummaryTool,
  searchProductsTool,
  getProductDetailsTool,
  getLowStockProductsTool,
  getOutOfStockProductsTool,
  prepareCreateProductTool,
  prepareUpdateProductTool,
  prepareArchiveProductTool,
  prepareBulkProductUpdateTool,
  prepareInventoryAdjustmentTool,
  searchOrdersTool,
  getOrderDetailsTool,
  getOrdersByStatusTool,
  getPendingOrdersTool,
  getOrderTimelineTool,
  getAllowedOrderTransitionsTool,
  prepareOrderStatusChangeTool,
  searchCustomersTool,
  getCustomerDetailsTool,
  getCustomerOrderHistoryTool,
  getSystemHealthTool,
  getWebhookActivityTool
];

export const ADMIN_CHAT_TOOLS_BY_NAME: Record<string, AdminChatTool> = Object.fromEntries(
  ADMIN_CHAT_TOOLS.map((tool) => [tool.name, tool])
);

// Dispatches POST /admin/chat/actions/:operationId/confirm to the executor
// matching the pending action's tool_name - the only place any of these
// executors is reachable from, so a real mutation can only ever run behind
// the prepare -> confirm flow, never directly from a tool call.
export const ADMIN_CHAT_EXECUTORS: Record<string, PendingActionExecutor> = {
  prepare_create_product: executeCreateProduct,
  prepare_update_product: executeUpdateProduct,
  prepare_archive_product: executeArchiveProduct,
  prepare_bulk_product_update: executeBulkProductUpdate,
  prepare_inventory_adjustment: executeInventoryAdjustment,
  prepare_order_status_change: executeOrderStatusChange
};

// Custom-event payload dispatched from inside this file's tool wrapper -
// a discriminated `kind` field rather than relying on the event name string
// passed to dispatchCustomEvent surviving into the "custom" stream chunk
// (the installed LangGraph version's types don't guarantee that; only the
// payload argument is documented as the streamed value). Token streaming
// used to have a "text_delta" variant here too, hand-forwarded from
// loop.ts's agent node - replaced by LangGraph's own streamMode:"messages"
// (see loop.ts), which needed no custom event at all once verified live
// that it correctly attributes chunks per-node via metadata.langgraph_node.
export type AdminChatCustomEvent = { kind: "status"; phase: "consulting" | "preparing" };

// Wraps one AdminChatTool (whose precondition checks, validation, and error
// boundary already live in define-tool.ts and don't change here) as a
// LangChain tool() - the only new surface is the calling convention.
// `ctx` comes from the graph's own state (threaded in by loop.ts's agent
// node, read here the same way defineAssistantTool reads
// runtime.state.data in apps/ai-assistant/worker.ts), never from the
// model's own arguments. `responseFormat: "content_and_artifact"` lets the
// tool return a [content, artifact] tuple: content is the compact summary
// the model sees on its next turn, artifact is the structured payload the
// admin-chat SSE route reads back off the resulting ToolMessage to render
// in the UI - same split apps/ai-assistant's tools already use.
function toLangchainTool(adminTool: AdminChatTool) {
  return tool(
    async (rawArgs: unknown, runtime: unknown) => {
      const typedRuntime = runtime as { state?: { data?: { ctx?: AdminChatContext } }; writer?: (chunk: AdminChatCustomEvent) => void } | undefined;
      const ctx = typedRuntime?.state?.data?.ctx;
      if (!ctx) {
        return ["Internal error: missing request context.", { type: "error", code: "NO_CONTEXT", message: "Missing request context." }] as const;
      }
      // config.writer, not @langchain/core's dispatchCustomEvent, is what
      // actually reaches loop.ts's streamMode:["updates","custom"] consumer
      // in this installed LangGraph version - verified live (see loop.ts's
      // AdminChatNodeConfig comment for the full story).
      typedRuntime?.writer?.({ kind: "status", phase: adminTool.requires?.mutation ? "preparing" : "consulting" });
      const result = await adminTool.run(rawArgs, ctx);
      return [result.message, result.artifact] as const;
    },
    {
      name: adminTool.name,
      description: adminTool.description,
      schema: adminTool.schema,
      responseFormat: "content_and_artifact"
    }
  );
}

export const ADMIN_CHAT_LANGCHAIN_TOOLS = ADMIN_CHAT_TOOLS.map(toLangchainTool);
