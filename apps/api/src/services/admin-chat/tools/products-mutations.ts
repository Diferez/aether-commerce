import { z } from "zod";
import { defineAdminChatTool } from "../define-tool";
import { createPendingAction } from "../pending-actions";
import { writeAuditLog } from "../../audit";
import { pick, type ChatLanguage } from "../language";
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

function productNotFoundMessage(language: ChatLanguage): string {
  return pick(language, "Product not found.", "Producto no encontrado.");
}

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
      summary: pick(ctx.language, `Create product "${args.name}"`, `Crear producto "${args.name}"`),
      targetLabel: args.name,
      fields: [
        { field: "name", before: null, after: args.name },
        { field: "category", before: null, after: args.category },
        { field: "priceCents", before: null, after: args.priceCents },
        { field: "stock", before: null, after: args.stock },
        { field: "visibility", before: null, after: "draft" }
      ],
      consequences: [
        pick(ctx.language, "Created as a draft - not visible to shoppers until published.", "Se crea como borrador - no será visible para los compradores hasta que se publique."),
        ...(args.shortDescription
          ? []
          : [pick(ctx.language, "No description was given, so the product name will be used as a placeholder.", "No se dio ninguna descripción, así que se usará el nombre del producto como marcador.")])
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
    return {
      message: pick(ctx.language, `Ready to create "${args.name}" as a draft. Please confirm.`, `Listo para crear "${args.name}" como borrador. Por favor confirma.`),
      artifact: { type: "pending_action", operationId, toolName: "prepare_create_product", diff, expiresAt }
    };
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
    if (!existing) {
      return {
        message: pick(ctx.language, "I could not find that product.", "No pude encontrar ese producto."),
        artifact: { type: "error", code: "PRODUCT_NOT_FOUND", message: productNotFoundMessage(ctx.language) }
      };
    }

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
      return {
        message: pick(ctx.language, "Nothing to change - those values already match.", "Nada que cambiar - esos valores ya coinciden."),
        artifact: { type: "missing_info", message: pick(ctx.language, "No fields differ from the current product.", "Ningún campo difiere del producto actual."), missingFields: [] }
      };
    }

    const diff: ActionDiff = { summary: pick(ctx.language, `Update ${existing.name}`, `Actualizar ${existing.name}`), targetLabel: existing.name, fields };
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
    return {
      message: pick(ctx.language, `Ready to update ${existing.name}. Please confirm.`, `Listo para actualizar ${existing.name}. Por favor confirma.`),
      artifact: { type: "pending_action", operationId, toolName: "prepare_update_product", diff, expiresAt }
    };
  }
});

export const executeUpdateProduct: PendingActionExecutor = async (ctx, params) => {
  const { productId, patch } = params as { productId: string; patch: ProductPatchInput };
  const row = await updateProduct(ctx.env, productId, patch);
  if (!row) return { success: false, code: "PRODUCT_NOT_FOUND", message: productNotFoundMessage(ctx.language) };
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
    if (!existing) {
      return {
        message: pick(ctx.language, "I could not find that product.", "No pude encontrar ese producto."),
        artifact: { type: "error", code: "PRODUCT_NOT_FOUND", message: productNotFoundMessage(ctx.language) }
      };
    }
    if (existing.visibility === "hidden") {
      return {
        message: pick(ctx.language, `${existing.name} is already archived.`, `${existing.name} ya está archivado.`),
        artifact: { type: "missing_info", message: pick(ctx.language, "Already archived.", "Ya está archivado."), missingFields: [] }
      };
    }
    const diff: ActionDiff = {
      summary: pick(ctx.language, `Archive ${existing.name}`, `Archivar ${existing.name}`),
      targetLabel: existing.name,
      fields: [{ field: "visibility", before: existing.visibility, after: "hidden" }],
      consequences: [
        pick(
          ctx.language,
          "The product will no longer be visible to shoppers. It is not deleted and can be republished later.",
          "El producto ya no será visible para los compradores. No se elimina y puede volver a publicarse más tarde."
        )
      ]
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
    return {
      message: pick(ctx.language, `Ready to archive ${existing.name}. Please confirm.`, `Listo para archivar ${existing.name}. Por favor confirma.`),
      artifact: { type: "pending_action", operationId, toolName: "prepare_archive_product", diff, expiresAt }
    };
  }
});

export const executeArchiveProduct: PendingActionExecutor = async (ctx, params) => {
  const { productId } = params as { productId: string };
  const row = await getProductRow(ctx.env, productId);
  if (!row) return { success: false, code: "PRODUCT_NOT_FOUND", message: productNotFoundMessage(ctx.language) };
  const changed = await setProductVisibility(ctx.env, productId, "hidden");
  if (!changed) return { success: false, code: "PRODUCT_NOT_FOUND", message: productNotFoundMessage(ctx.language) };
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
      return {
        message: pick(ctx.language, `No products found in category "${args.category}".`, `No se encontraron productos en la categoría "${args.category}".`),
        artifact: { type: "error", code: "CATEGORY_EMPTY", message: pick(ctx.language, "No products in that category.", "No hay productos en esa categoría.") }
      };
    }
    const verb = args.percent > 0 ? pick(ctx.language, "Increase", "Aumentar") : pick(ctx.language, "Decrease", "Reducir");
    const diff: ActionDiff = {
      summary: pick(
        ctx.language,
        `${args.percent > 0 ? "Increase" : "Decrease"} prices by ${Math.abs(args.percent)}% in "${args.category}"`,
        `${verb} precios en ${Math.abs(args.percent)}% en "${args.category}"`
      ),
      targetLabel: args.category,
      fields: [{ field: "priceCents", before: pick(ctx.language, "varies per product", "varía por producto"), after: `${args.percent > 0 ? "+" : ""}${args.percent}%` }],
      affectedCount: rows.length,
      sampleAffected: rows.slice(0, 5).map((row) => `${row.name}: ${(row.priceCents / 100).toFixed(2)} -> ${(row.nextPriceCents / 100).toFixed(2)}`),
      consequences: [
        pick(
          ctx.language,
          `This changes the price of all ${rows.length} product(s) in "${args.category}" at once.`,
          `Esto cambia el precio de los ${rows.length} producto(s) de "${args.category}" a la vez.`
        )
      ]
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
    return {
      message: pick(
        ctx.language,
        `Ready to update ${rows.length} product(s) in "${args.category}". Please confirm.`,
        `Listo para actualizar ${rows.length} producto(s) en "${args.category}". Por favor confirma.`
      ),
      artifact: { type: "pending_action", operationId, toolName: "prepare_bulk_product_update", diff, expiresAt }
    };
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
    if (!existing) {
      return {
        message: pick(ctx.language, "I could not find that product.", "No pude encontrar ese producto."),
        artifact: { type: "error", code: "PRODUCT_NOT_FOUND", message: productNotFoundMessage(ctx.language) }
      };
    }
    const nextStock = Math.max(0, existing.stock + args.delta);
    const diff: ActionDiff = {
      summary: pick(ctx.language, `Adjust stock for ${existing.name}`, `Ajustar stock de ${existing.name}`),
      targetLabel: existing.name,
      fields: [{ field: "stock", before: existing.stock, after: nextStock }],
      consequences: args.reason ? [pick(ctx.language, `Reason: ${args.reason}`, `Motivo: ${args.reason}`)] : []
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
    return {
      message: pick(ctx.language, `Ready to adjust ${existing.name}'s stock by ${args.delta}. Please confirm.`, `Listo para ajustar el stock de ${existing.name} en ${args.delta}. Por favor confirma.`),
      artifact: { type: "pending_action", operationId, toolName: "prepare_inventory_adjustment", diff, expiresAt }
    };
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
  if (!result) return { success: false, code: "PRODUCT_NOT_FOUND", message: productNotFoundMessage(ctx.language) };
  return { success: true, result: { productId, stock: result.stock } };
};
