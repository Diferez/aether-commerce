import { z } from "zod";
import { defineAdminChatTool } from "../define-tool";
import { createPendingAction } from "../pending-actions";
import { writeAuditLog } from "../../audit";
import {
  adjustProductInventory,
  bulkAdjustPriceByCategory,
  createProduct,
  getProductRow,
  previewBulkPriceAdjustment,
  setProductVisibility,
  updateProduct,
  type ProductPatchInput,
  type ProductWriteInput
} from "../../products-admin";
import type { ActionDiff } from "../artifacts";
import type { PendingActionExecutor } from "../executors";

// Only fields chat can realistically gather from a short natural-language
// request. name/category/priceCents/stock/imageUrl are required arguments
// (not defaulted) so the model has to ask the operator for whichever of
// them is missing instead of the tool silently fabricating one - an image
// URL in particular can't be sensibly defaulted the way a description can.
export const prepareCreateProductTool = defineAdminChatTool({
  name: "prepare_create_product",
  description:
    "Prepares creating a new product (as a draft). Requires name, category, price in cents, starting stock, and a main image URL. Returns a preview that must be confirmed before anything is created.",
  schema: z.object({
    name: z.string().min(1).max(200),
    category: z.string().min(1).max(60),
    priceCents: z.number().int().min(0),
    stock: z.number().int().min(0),
    imageUrl: z.string().url(),
    shortDescription: z.string().min(1).max(300).optional()
  }),
  requires: { permission: "products.write", mutation: true },
  run: async (args, ctx) => {
    const params: ProductWriteInput = {
      name: args.name,
      category: args.category,
      priceCents: args.priceCents,
      stock: args.stock,
      shortDescription: args.shortDescription ?? args.name,
      description: args.shortDescription ?? args.name,
      images: { main: args.imageUrl, gallery: [] },
      visibility: "draft"
    };
    const diff: ActionDiff = {
      summary: `Create product "${args.name}"`,
      targetLabel: args.name,
      fields: [
        { field: "name", before: null, after: args.name },
        { field: "category", before: null, after: args.category },
        { field: "priceCents", before: null, after: args.priceCents },
        { field: "stock", before: null, after: args.stock },
        { field: "visibility", before: null, after: "draft" }
      ],
      consequences: [
        "Created as a draft - not visible to shoppers until published.",
        ...(args.shortDescription ? [] : ["No description was given, so the product name will be used as a placeholder."])
      ]
    };
    const { operationId, expiresAt } = await createPendingAction(ctx.env, {
      conversationId: ctx.conversationId,
      actorId: ctx.actor.userId ?? "admin",
      toolName: "prepare_create_product",
      targetType: "product",
      targetId: null,
      params: params as unknown as Record<string, unknown>,
      diff,
      requestId: ctx.requestId
    });
    return { message: `Ready to create "${args.name}" as a draft. Please confirm.`, artifact: { type: "pending_action", operationId, toolName: "prepare_create_product", diff, expiresAt } };
  }
});

export const executeCreateProduct: PendingActionExecutor = async (ctx, params) => {
  const row = await createProduct(ctx.env, params as unknown as ProductWriteInput);
  await writeAuditLog(ctx.env, {
    actorId: ctx.actor.userId ?? "admin",
    action: "product.created",
    targetType: "product",
    targetId: row.id,
    payload: { name: row.name, sku: row.sku, source: "admin_chat" }
  });
  return { success: true, result: { productId: row.id, name: row.name, sku: row.sku } };
};

export const prepareUpdateProductTool = defineAdminChatTool({
  name: "prepare_update_product",
  description: "Prepares changing an existing product's name, price, stock, or category. Returns a preview that must be confirmed before anything changes.",
  schema: z.object({
    productId: z.string().min(1),
    name: z.string().min(1).max(200).optional(),
    priceCents: z.number().int().min(0).optional(),
    stock: z.number().int().min(0).optional(),
    category: z.string().min(1).max(60).optional()
  }),
  requires: { permission: "products.write", mutation: true },
  run: async (args, ctx) => {
    const existing = await getProductRow(ctx.env, args.productId);
    if (!existing) return { message: "I could not find that product.", artifact: { type: "error", code: "PRODUCT_NOT_FOUND", message: "Product not found." } };

    const patch: ProductPatchInput = {};
    const fields: ActionDiff["fields"] = [];
    if (args.name !== undefined && args.name !== existing.name) {
      patch.name = args.name;
      fields.push({ field: "name", before: existing.name, after: args.name });
    }
    if (args.priceCents !== undefined && args.priceCents !== existing.final_price_cents) {
      patch.priceCents = args.priceCents;
      fields.push({ field: "priceCents", before: existing.final_price_cents, after: args.priceCents });
    }
    if (args.stock !== undefined && args.stock !== existing.stock) {
      patch.stock = args.stock;
      fields.push({ field: "stock", before: existing.stock, after: args.stock });
    }
    if (args.category !== undefined && args.category !== existing.category) {
      patch.category = args.category;
      fields.push({ field: "category", before: existing.category, after: args.category });
    }

    if (fields.length === 0) {
      return { message: "Nothing to change - those values already match.", artifact: { type: "missing_info", message: "No fields differ from the current product.", missingFields: [] } };
    }

    const diff: ActionDiff = { summary: `Update ${existing.name}`, targetLabel: existing.name, fields };
    const { operationId, expiresAt } = await createPendingAction(ctx.env, {
      conversationId: ctx.conversationId,
      actorId: ctx.actor.userId ?? "admin",
      toolName: "prepare_update_product",
      targetType: "product",
      targetId: existing.id,
      params: { productId: existing.id, patch: patch as unknown as Record<string, unknown> },
      diff,
      requestId: ctx.requestId
    });
    return { message: `Ready to update ${existing.name}. Please confirm.`, artifact: { type: "pending_action", operationId, toolName: "prepare_update_product", diff, expiresAt } };
  }
});

export const executeUpdateProduct: PendingActionExecutor = async (ctx, params) => {
  const { productId, patch } = params as { productId: string; patch: ProductPatchInput };
  const row = await updateProduct(ctx.env, productId, patch);
  if (!row) return { success: false, code: "PRODUCT_NOT_FOUND", message: "Product not found." };
  await writeAuditLog(ctx.env, { actorId: ctx.actor.userId ?? "admin", action: "product.updated", targetType: "product", targetId: row.id, payload: { ...patch, source: "admin_chat" } });
  return { success: true, result: { productId: row.id, name: row.name } };
};

export const prepareArchiveProductTool = defineAdminChatTool({
  name: "prepare_archive_product",
  description: "Prepares archiving (hiding) a product from the storefront. Products are archived, never permanently deleted, from chat.",
  schema: z.object({ productId: z.string().min(1) }),
  requires: { permission: "products.write", mutation: true },
  run: async (args, ctx) => {
    const existing = await getProductRow(ctx.env, args.productId);
    if (!existing) return { message: "I could not find that product.", artifact: { type: "error", code: "PRODUCT_NOT_FOUND", message: "Product not found." } };
    if (existing.visibility === "hidden") {
      return { message: `${existing.name} is already archived.`, artifact: { type: "missing_info", message: "Already archived.", missingFields: [] } };
    }
    const diff: ActionDiff = {
      summary: `Archive ${existing.name}`,
      targetLabel: existing.name,
      fields: [{ field: "visibility", before: existing.visibility, after: "hidden" }],
      consequences: ["The product will no longer be visible to shoppers. It is not deleted and can be republished later."]
    };
    const { operationId, expiresAt } = await createPendingAction(ctx.env, {
      conversationId: ctx.conversationId,
      actorId: ctx.actor.userId ?? "admin",
      toolName: "prepare_archive_product",
      targetType: "product",
      targetId: existing.id,
      params: { productId: existing.id },
      diff,
      requestId: ctx.requestId
    });
    return { message: `Ready to archive ${existing.name}. Please confirm.`, artifact: { type: "pending_action", operationId, toolName: "prepare_archive_product", diff, expiresAt } };
  }
});

export const executeArchiveProduct: PendingActionExecutor = async (ctx, params) => {
  const { productId } = params as { productId: string };
  const row = await getProductRow(ctx.env, productId);
  if (!row) return { success: false, code: "PRODUCT_NOT_FOUND", message: "Product not found." };
  const changed = await setProductVisibility(ctx.env, productId, "hidden");
  if (!changed) return { success: false, code: "PRODUCT_NOT_FOUND", message: "Product not found." };
  await writeAuditLog(ctx.env, { actorId: ctx.actor.userId ?? "admin", action: "product.visibility_changed", targetType: "product", targetId: productId, payload: { visibility: "hidden", source: "admin_chat" } });
  return { success: true, result: { productId, name: row.name, visibility: "hidden" } };
};

export const prepareBulkProductUpdateTool = defineAdminChatTool({
  name: "prepare_bulk_product_update",
  description: "Prepares a price change (percent increase or decrease) applied to every product in one category. Returns a preview listing how many products are affected and a few examples.",
  schema: z.object({
    category: z.string().min(1).max(60),
    percent: z.number().min(-90).max(500)
  }),
  requires: { permission: "products.write", mutation: true },
  run: async (args, ctx) => {
    const rows = await previewBulkPriceAdjustment(ctx.env, { category: args.category, percent: args.percent });
    if (rows.length === 0) {
      return { message: `No products found in category "${args.category}".`, artifact: { type: "error", code: "CATEGORY_EMPTY", message: "No products in that category." } };
    }
    const diff: ActionDiff = {
      summary: `${args.percent > 0 ? "Increase" : "Decrease"} prices by ${Math.abs(args.percent)}% in "${args.category}"`,
      targetLabel: args.category,
      fields: [{ field: "priceCents", before: "varies per product", after: `${args.percent > 0 ? "+" : ""}${args.percent}%` }],
      affectedCount: rows.length,
      sampleAffected: rows.slice(0, 5).map((row) => `${row.name}: ${(row.priceCents / 100).toFixed(2)} -> ${(row.nextPriceCents / 100).toFixed(2)}`),
      consequences: [`This changes the price of all ${rows.length} product(s) in "${args.category}" at once.`]
    };
    const { operationId, expiresAt } = await createPendingAction(ctx.env, {
      conversationId: ctx.conversationId,
      actorId: ctx.actor.userId ?? "admin",
      toolName: "prepare_bulk_product_update",
      targetType: "product",
      targetId: null,
      params: { category: args.category, percent: args.percent },
      diff,
      requestId: ctx.requestId
    });
    return { message: `Ready to update ${rows.length} product(s) in "${args.category}". Please confirm.`, artifact: { type: "pending_action", operationId, toolName: "prepare_bulk_product_update", diff, expiresAt } };
  }
});

export const executeBulkProductUpdate: PendingActionExecutor = async (ctx, params) => {
  const { category, percent } = params as { category: string; percent: number };
  const changed = await bulkAdjustPriceByCategory(ctx.env, { category, percent });
  await writeAuditLog(ctx.env, { actorId: ctx.actor.userId ?? "admin", action: "product.bulk_price_adjusted", targetType: "product", targetId: null, payload: { category, percent, changed, source: "admin_chat" } });
  return { success: true, result: { category, percent, changed } };
};

export const prepareInventoryAdjustmentTool = defineAdminChatTool({
  name: "prepare_inventory_adjustment",
  description: "Prepares a manual stock adjustment (positive or negative) for one product. Returns a preview that must be confirmed before stock changes.",
  schema: z.object({ productId: z.string().min(1), delta: z.number().int().refine((value) => value !== 0), reason: z.string().max(300).optional() }),
  requires: { permission: "inventory.write", mutation: true },
  run: async (args, ctx) => {
    const existing = await getProductRow(ctx.env, args.productId);
    if (!existing) return { message: "I could not find that product.", artifact: { type: "error", code: "PRODUCT_NOT_FOUND", message: "Product not found." } };
    const nextStock = Math.max(0, existing.stock + args.delta);
    const diff: ActionDiff = {
      summary: `Adjust stock for ${existing.name}`,
      targetLabel: existing.name,
      fields: [{ field: "stock", before: existing.stock, after: nextStock }],
      consequences: args.reason ? [`Reason: ${args.reason}`] : []
    };
    const { operationId, expiresAt } = await createPendingAction(ctx.env, {
      conversationId: ctx.conversationId,
      actorId: ctx.actor.userId ?? "admin",
      toolName: "prepare_inventory_adjustment",
      targetType: "product",
      targetId: existing.id,
      params: { productId: existing.id, delta: args.delta, reason: args.reason ?? null },
      diff,
      requestId: ctx.requestId
    });
    return { message: `Ready to adjust ${existing.name}'s stock by ${args.delta}. Please confirm.`, artifact: { type: "pending_action", operationId, toolName: "prepare_inventory_adjustment", diff, expiresAt } };
  }
});

export const executeInventoryAdjustment: PendingActionExecutor = async (ctx, params) => {
  const { productId, delta, reason } = params as { productId: string; delta: number; reason: string | null };
  const result = await adjustProductInventory(ctx.env, productId, {
    delta,
    reason: reason ?? undefined,
    actorId: ctx.actor.userId ?? "admin",
    requestId: ctx.requestId
  });
  if (!result) return { success: false, code: "PRODUCT_NOT_FOUND", message: "Product not found." };
  return { success: true, result: { productId, stock: result.stock } };
};
