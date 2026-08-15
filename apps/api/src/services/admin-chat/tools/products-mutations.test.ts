import { describe, expect, it } from "vitest";
import { executeBulkProductUpdate, prepareBulkProductUpdateTool } from "./products-mutations";
import { fakeContext, fakeEnv } from "../test-support";

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
