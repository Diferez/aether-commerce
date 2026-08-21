import { z } from "zod";
import { defineAdminChatTool, notFoundResult } from "../define-tool";
import { getProductRow, listProductsForAdmin } from "../../products-admin";
import { pick } from "../language";
import type { ProductDetailArtifact, ProductSummaryArtifact } from "../artifacts";
import type { AdminProductSummary } from "../../products-admin";

function toSummaryArtifact(row: AdminProductSummary): ProductSummaryArtifact {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    priceCents: row.finalPriceCents,
    stock: row.stock,
    visibility: row.visibility,
    href: `/products/edit/?id=${encodeURIComponent(row.id)}`
  };
}

// See orders.ts's summarizeOrdersForModel for why this exists: the model
// only ever reads `message` back, never the artifact, so a bare count
// leaves it unable to reference a specific product for a follow-up call.
// Kept in English regardless of operator language, same reasoning as
// summarizeOrdersForModel - this half of `message` is model-facing
// reasoning context, never shown to the operator verbatim.
function summarizeProductsForModel(products: ProductSummaryArtifact[]): string {
  return products
    .map((product) => `- ${product.name} (SKU ${product.sku}): ${product.stock} in stock, ${product.visibility}`)
    .join("\n");
}

export const searchProductsTool = defineAdminChatTool({
  name: "search_products",
  description: "Searches products by name, SKU, or slug, with optional category/visibility/stock filters. Use this for any 'find products...' request.",
  schema: z.object({
    query: z.string().max(100).optional(),
    category: z.string().max(60).optional(),
    visibility: z.enum(["draft", "visible", "hidden"]).optional(),
    stock: z.enum(["low", "out"]).optional(),
    pageSize: z.number().int().min(1).max(25).default(10)
  }),
  requires: { permission: "products.read" },
  run: async (args, ctx) => {
    const result = await listProductsForAdmin(ctx.env, {
      search: args.query,
      category: args.category,
      visibility: args.visibility,
      stockFilter: args.stock,
      page: 1,
      pageSize: args.pageSize
    });
    const products = result.data.map(toSummaryArtifact);
    if (products.length === 0) {
      return { message: pick(ctx.language, "No products matched that search.", "Ningún producto coincidió con esa búsqueda."), artifact: { type: "product_list", products: [] } };
    }
    const shortMessage = pick(
      ctx.language,
      `Found ${result.pagination.total} product(s)${result.pagination.total > products.length ? `, showing the first ${products.length}` : ""}.`,
      `Se encontraron ${result.pagination.total} producto(s)${result.pagination.total > products.length ? `, mostrando los primeros ${products.length}` : ""}.`
    );
    return {
      message: `${shortMessage}\n${summarizeProductsForModel(products)}`,
      artifact: { type: "product_list", products, displayMessage: shortMessage }
    };
  }
});

export const getProductDetailsTool = defineAdminChatTool({
  name: "get_product_details",
  description: "Gets full details for one product by id.",
  schema: z.object({ productId: z.string().min(1) }),
  requires: { permission: "products.read" },
  run: async (args, ctx) => {
    const row = await getProductRow(ctx.env, args.productId);
    if (!row) return notFoundResult(ctx, "PRODUCT_NOT_FOUND", "product", "producto");
    const product: ProductDetailArtifact = {
      id: row.id,
      name: row.name,
      sku: row.sku,
      category: row.category,
      priceCents: row.final_price_cents,
      compareAtPriceCents: row.compare_at_price_cents,
      stock: row.stock,
      lowStockThreshold: row.low_stock_threshold,
      visibility: row.visibility,
      brand: row.brand,
      href: `/products/edit/?id=${encodeURIComponent(row.id)}`
    };
    return {
      message: pick(ctx.language, `${row.name} - ${row.stock} in stock, ${row.visibility}.`, `${row.name} - ${row.stock} en stock, ${row.visibility}.`),
      artifact: { type: "product_detail", product }
    };
  }
});

export const getLowStockProductsTool = defineAdminChatTool({
  name: "get_low_stock_products",
  description: "Lists products at or below their low-stock threshold (but not yet at zero).",
  schema: z.object({ pageSize: z.number().int().min(1).max(25).default(10) }),
  requires: { permission: "inventory.read" },
  run: async (args, ctx) => {
    const result = await listProductsForAdmin(ctx.env, { stockFilter: "low", page: 1, pageSize: args.pageSize, sort: "stock", sortDirection: "asc" });
    const products = result.data.map(toSummaryArtifact);
    if (products.length === 0) {
      return { message: pick(ctx.language, "No products are currently low on stock.", "Ningún producto tiene poco stock actualmente."), artifact: { type: "product_list", products: [] } };
    }
    const shortMessage = pick(ctx.language, `${result.pagination.total} product(s) are low on stock.`, `${result.pagination.total} producto(s) tienen poco stock.`);
    return {
      message: `${shortMessage}\n${summarizeProductsForModel(products)}`,
      artifact: { type: "product_list", products, displayMessage: shortMessage }
    };
  }
});

export const getOutOfStockProductsTool = defineAdminChatTool({
  name: "get_out_of_stock_products",
  description: "Lists products that are completely out of stock.",
  schema: z.object({ pageSize: z.number().int().min(1).max(25).default(10) }),
  requires: { permission: "inventory.read" },
  run: async (args, ctx) => {
    const result = await listProductsForAdmin(ctx.env, { stockFilter: "out", page: 1, pageSize: args.pageSize });
    const products = result.data.map(toSummaryArtifact);
    if (products.length === 0) {
      return { message: pick(ctx.language, "No products are out of stock.", "Ningún producto está agotado."), artifact: { type: "product_list", products: [] } };
    }
    const shortMessage = pick(ctx.language, `${result.pagination.total} product(s) are out of stock.`, `${result.pagination.total} producto(s) están agotados.`);
    return {
      message: `${shortMessage}\n${summarizeProductsForModel(products)}`,
      artifact: { type: "product_list", products, displayMessage: shortMessage }
    };
  }
});
