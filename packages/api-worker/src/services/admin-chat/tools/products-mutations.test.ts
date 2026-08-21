import { describe, expect, it } from "vitest";
import {
  executeArchiveProduct,
  executeBulkProductUpdate,
  executeCreateProduct,
  executeInventoryAdjustment,
  executeUpdateProduct,
  prepareArchiveProductTool,
  prepareBulkProductUpdateTool,
  prepareCreateProductTool,
  prepareInventoryAdjustmentTool,
  prepareUpdateProductTool
} from "./products-mutations";
import { fakeContext, fakeEnv } from "../test-support";

const PRODUCT_ROW = {
  id: "prd_1",
  sku: "SKU-A",
  slug: "funda-a",
  name: "Funda A",
  brand: "Aether",
  category: "fundas",
  price_cents: 1000,
  compare_at_price_cents: null,
  final_price_cents: 1000,
  stock: 12,
  low_stock_threshold: 4,
  visibility: "visible" as const,
  featured: 0,
  is_new: 0,
  is_deal: 0,
  rating_average: 0,
  rating_count: 0,
  details_json: JSON.stringify({ images: { main: "https://example.com/a.jpg" } }),
  created_at: "2026-01-01",
  updated_at: "2026-01-01"
};

describe("prepareBulkProductUpdateTool", () => {
  it("previews the exact per-product before/after prices and affected count for a category-wide increase", async () => {
    const { env } = fakeEnv([
      {
        all: [
          { id: "prd_1", name: "Funda A", sku: "SKU-A", final_price_cents: 1000 },
          { id: "prd_2", name: "Funda B", sku: "SKU-B", final_price_cents: 2000 }
        ]
      },
      { first: null }, // createPendingAction: no existing row
      {}, // insert
      { first: { id: "pact_bulk", expires_at: new Date(Date.now() + 300_000).toISOString() } }
    ]);
    const ctx = fakeContext(env);

    const result = await prepareBulkProductUpdateTool.run({ category: "fundas", percent: 10 }, ctx);

    expect(result.artifact).toMatchObject({ type: "pending_action", operationId: "pact_bulk" });
    if (result.artifact.type === "pending_action") {
      expect(result.artifact.diff.affectedCount).toBe(2);
      expect(result.artifact.diff.sampleAffected).toEqual(["Funda A: 10.00 -> 11.00", "Funda B: 20.00 -> 22.00"]);
    }
  });

  it("reports an empty category instead of preparing a no-op action", async () => {
    const { env, db } = fakeEnv([{ all: [] }]);
    const ctx = fakeContext(env);

    const result = await prepareBulkProductUpdateTool.run({ category: "nonexistent", percent: 10 }, ctx);

    expect(result.artifact).toMatchObject({ type: "error", code: "CATEGORY_EMPTY" });
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });
});

describe("executeBulkProductUpdate", () => {
  it("applies the price adjustment and writes one audit log entry for the whole batch", async () => {
    const { env, db } = fakeEnv([
      { run: { changes: 2 } }, // update products set price_cents = ...
      {}, // clearCatalogCache's delete from products_cache
      {} // writeAuditLog insert
    ]);
    const ctx = fakeContext(env);

    const outcome = await executeBulkProductUpdate(ctx, { category: "fundas", percent: 10 });

    expect(outcome).toEqual({ success: true, result: { category: "fundas", percent: 10, changed: 2 } });
    expect(db.prepare).toHaveBeenCalledTimes(3);
  });
});

describe("prepareCreateProductTool", () => {
  it("previews a new draft product with a placeholder-description warning when none was given", async () => {
    const { env } = fakeEnv([
      { first: null }, // createPendingAction: no existing row
      {}, // insert
      { first: { id: "pact_create", expires_at: new Date(Date.now() + 300_000).toISOString() } }
    ]);
    const ctx = fakeContext(env);

    const result = await prepareCreateProductTool.run(
      { name: "Funda Nueva", category: "fundas", priceCents: 1500, stock: 10, imageUrl: "https://example.com/nueva.jpg" },
      ctx
    );

    expect(result.artifact).toMatchObject({ type: "pending_action", operationId: "pact_create", toolName: "prepare_create_product" });
    if (result.artifact.type === "pending_action") {
      expect(result.artifact.diff.fields).toContainEqual({ field: "visibility", before: null, after: "draft" });
      expect(result.artifact.diff.consequences).toContainEqual(expect.stringMatching(/placeholder/i));
    }
  });
});

describe("executeCreateProduct", () => {
  it("creates the product as a draft and writes an audit log entry", async () => {
    const { env, db } = fakeEnv([
      { first: null }, // uniqueSlug: no existing product with that slug
      { first: null }, // uniqueSku: no existing product with that sku
      {}, // insert
      {}, // clearCatalogCache
      { first: PRODUCT_ROW }, // getProductRow read-back
      {} // writeAuditLog insert
    ]);
    const ctx = fakeContext(env);

    const outcome = await executeCreateProduct(ctx, {
      name: "Funda A",
      category: "fundas",
      priceCents: 1000,
      stock: 12,
      shortDescription: "Funda A",
      description: "Funda A",
      images: { main: "https://example.com/a.jpg", gallery: [] },
      visibility: "draft"
    });

    expect(outcome).toEqual({ success: true, result: { productId: "prd_1", name: "Funda A", sku: "SKU-A" } });
    expect(db.prepare).toHaveBeenCalledTimes(6);
  });
});

describe("prepareUpdateProductTool", () => {
  it("returns PRODUCT_NOT_FOUND for an unknown product", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const result = await prepareUpdateProductTool.run({ productId: "prd_missing", stock: 5 }, ctx);

    expect(result.artifact).toEqual({ type: "error", code: "PRODUCT_NOT_FOUND", message: "Product not found." });
  });

  it("reports nothing to change instead of preparing a no-op action when values already match", async () => {
    const { env, db } = fakeEnv([{ first: PRODUCT_ROW }]);
    const ctx = fakeContext(env);

    const result = await prepareUpdateProductTool.run({ productId: "prd_1", stock: PRODUCT_ROW.stock }, ctx);

    expect(result.artifact).toMatchObject({ type: "missing_info" });
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it("previews only the fields that actually differ from the current product", async () => {
    const { env } = fakeEnv([
      { first: PRODUCT_ROW },
      { first: null }, // createPendingAction: no existing row
      {}, // insert
      { first: { id: "pact_update", expires_at: new Date(Date.now() + 300_000).toISOString() } }
    ]);
    const ctx = fakeContext(env);

    const result = await prepareUpdateProductTool.run({ productId: "prd_1", stock: 20 }, ctx);

    expect(result.artifact).toMatchObject({ type: "pending_action", operationId: "pact_update" });
    if (result.artifact.type === "pending_action") {
      expect(result.artifact.diff.fields).toEqual([{ field: "stock", before: 12, after: 20 }]);
    }
  });
});

describe("executeUpdateProduct", () => {
  it("returns PRODUCT_NOT_FOUND if the product was removed since the preview was shown", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const outcome = await executeUpdateProduct(ctx, { productId: "prd_1", patch: { stock: 20 } });

    expect(outcome).toEqual({ success: false, code: "PRODUCT_NOT_FOUND", message: "Product not found." });
  });

  it("applies the patch and writes an audit log entry", async () => {
    const { env, db } = fakeEnv([
      { first: PRODUCT_ROW }, // updateProduct's existing-row read
      {}, // update ... where id = ?
      {}, // clearCatalogCache
      { first: { ...PRODUCT_ROW, stock: 20 } }, // getProductRow read-back
      {} // writeAuditLog insert
    ]);
    const ctx = fakeContext(env);

    const outcome = await executeUpdateProduct(ctx, { productId: "prd_1", patch: { stock: 20 } });

    expect(outcome).toEqual({ success: true, result: { productId: "prd_1", name: "Funda A" } });
    expect(db.prepare).toHaveBeenCalledTimes(5);
  });
});

describe("prepareArchiveProductTool", () => {
  it("returns PRODUCT_NOT_FOUND for an unknown product", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const result = await prepareArchiveProductTool.run({ productId: "prd_missing" }, ctx);

    expect(result.artifact).toEqual({ type: "error", code: "PRODUCT_NOT_FOUND", message: "Product not found." });
  });

  it("reports already archived instead of preparing a no-op action", async () => {
    const { env, db } = fakeEnv([{ first: { ...PRODUCT_ROW, visibility: "hidden" } }]);
    const ctx = fakeContext(env);

    const result = await prepareArchiveProductTool.run({ productId: "prd_1" }, ctx);

    expect(result.message).toMatch(/already archived/i);
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it("previews archiving a visible product", async () => {
    const { env } = fakeEnv([
      { first: PRODUCT_ROW },
      { first: null }, // createPendingAction: no existing row
      {}, // insert
      { first: { id: "pact_archive", expires_at: new Date(Date.now() + 300_000).toISOString() } }
    ]);
    const ctx = fakeContext(env);

    const result = await prepareArchiveProductTool.run({ productId: "prd_1" }, ctx);

    expect(result.artifact).toMatchObject({ type: "pending_action", operationId: "pact_archive", toolName: "prepare_archive_product" });
  });
});

describe("executeArchiveProduct", () => {
  it("returns PRODUCT_NOT_FOUND if the product was removed since the preview was shown", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const outcome = await executeArchiveProduct(ctx, { productId: "prd_1" });

    expect(outcome).toEqual({ success: false, code: "PRODUCT_NOT_FOUND", message: "Product not found." });
  });

  it("sets visibility to hidden and writes an audit log entry", async () => {
    const { env, db } = fakeEnv([
      { first: PRODUCT_ROW }, // getProductRow existence check
      { run: { changes: 1 } }, // update products set visibility = 'hidden' ...
      {}, // clearCatalogCache
      {} // writeAuditLog insert
    ]);
    const ctx = fakeContext(env);

    const outcome = await executeArchiveProduct(ctx, { productId: "prd_1" });

    expect(outcome).toEqual({ success: true, result: { productId: "prd_1", name: "Funda A", visibility: "hidden" } });
    expect(db.prepare).toHaveBeenCalledTimes(4);
  });
});

describe("prepareInventoryAdjustmentTool", () => {
  it("returns PRODUCT_NOT_FOUND for an unknown product", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const result = await prepareInventoryAdjustmentTool.run({ productId: "prd_missing", delta: 5 }, ctx);

    expect(result.artifact).toEqual({ type: "error", code: "PRODUCT_NOT_FOUND", message: "Product not found." });
  });

  it("clamps the preview's projected stock at zero for a decrease larger than current stock", async () => {
    const { env } = fakeEnv([
      { first: { ...PRODUCT_ROW, stock: 3 } },
      { first: null }, // createPendingAction: no existing row
      {}, // insert
      { first: { id: "pact_inv", expires_at: new Date(Date.now() + 300_000).toISOString() } }
    ]);
    const ctx = fakeContext(env);

    const result = await prepareInventoryAdjustmentTool.run({ productId: "prd_1", delta: -10, reason: "Damaged in transit" }, ctx);

    expect(result.artifact).toMatchObject({ type: "pending_action", operationId: "pact_inv" });
    if (result.artifact.type === "pending_action") {
      expect(result.artifact.diff.fields).toEqual([{ field: "stock", before: 3, after: 0 }]);
      expect(result.artifact.diff.consequences).toEqual(["Reason: Damaged in transit"]);
    }
  });
});

describe("executeInventoryAdjustment", () => {
  it("returns PRODUCT_NOT_FOUND if the product was removed since the preview was shown", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const outcome = await executeInventoryAdjustment(ctx, { productId: "prd_1", delta: 5, reason: null });

    expect(outcome).toEqual({ success: false, code: "PRODUCT_NOT_FOUND", message: "Product not found." });
  });

  it("applies the delta, floors at zero, and records an inventory movement plus audit log entry in one batch", async () => {
    const { env, db } = fakeEnv([
      { first: { ...PRODUCT_ROW, stock: 3 } }, // getProductRow existence check
      {}, // update products set stock = ... (constructed for the batch)
      {}, // insert into inventory_movements (constructed for the batch)
      {} // insert into audit_logs (constructed for the batch)
    ]);
    const ctx = fakeContext(env);

    const outcome = await executeInventoryAdjustment(ctx, { productId: "prd_1", delta: -10, reason: "Damaged in transit" });

    expect(outcome).toEqual({ success: true, result: { productId: "prd_1", stock: 0 } });
    expect(db.batch).toHaveBeenCalledTimes(1);
  });
});
