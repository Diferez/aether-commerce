import { z } from "zod";
import type { AdminChatTool } from "./define-tool";
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
  getCustomerOrderHistoryTool
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

// zod v4 ships a native JSON Schema converter - used only to build each
// tool's provider-facing parameter declaration (ProviderToolDeclaration),
// completely independent of which provider ends up reading it.
export function buildToolDeclarations(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
  return ADMIN_CHAT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.schema, { target: "draft-07" }) as Record<string, unknown>
  }));
}
