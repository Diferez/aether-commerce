import { describe, expect, it } from "vitest";
import { getLowStockProductsTool, getOutOfStockProductsTool, getProductDetailsTool, searchProductsTool } from "./products";
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

describe("searchProductsTool", () => {
  it("returns a product_list artifact for matches", async () => {
    const { env } = fakeEnv([{ first: { count: 1 } }, { all: [PRODUCT_ROW] }]);
    const ctx = fakeContext(env);

    const result = await searchProductsTool.run({ query: "funda", pageSize: 10 }, ctx);

    expect(result.artifact).toMatchObject({
      type: "product_list",
      products: [{ id: "prd_1", name: "Funda A", sku: "SKU-A", priceCents: 1000, stock: 12, visibility: "visible", href: "/products/edit/?id=prd_1" }]
    });
  });

  it("reports no matches without inventing a product", async () => {
    const { env } = fakeEnv([{ first: { count: 0 } }, { all: [] }]);
    const ctx = fakeContext(env);

    const result = await searchProductsTool.run({ query: "nonexistent", pageSize: 10 }, ctx);

    expect(result.artifact).toEqual({ type: "product_list", products: [] });
    expect(result.message).toMatch(/no products matched/i);
  });
});

describe("getProductDetailsTool", () => {
  it("returns PRODUCT_NOT_FOUND for an unknown id", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const result = await getProductDetailsTool.run({ productId: "prd_missing" }, ctx);

    expect(result.artifact).toEqual({ type: "error", code: "PRODUCT_NOT_FOUND", message: "Product not found." });
  });

  it("returns full product_detail including stock threshold and brand", async () => {
    const { env } = fakeEnv([{ first: PRODUCT_ROW }]);
    const ctx = fakeContext(env);

    const result = await getProductDetailsTool.run({ productId: "prd_1" }, ctx);

    expect(result.artifact).toMatchObject({
      type: "product_detail",
      product: { id: "prd_1", sku: "SKU-A", lowStockThreshold: 4, brand: "Aether", visibility: "visible" }
    });
  });
});

describe("getLowStockProductsTool", () => {
  it("lists products at or below their low-stock threshold", async () => {
    const lowStockRow = { ...PRODUCT_ROW, stock: 2 };
    const { env } = fakeEnv([{ first: { count: 1 } }, { all: [lowStockRow] }]);
    const ctx = fakeContext(env);

    const result = await getLowStockProductsTool.run({ pageSize: 10 }, ctx);

    expect(result.artifact).toMatchObject({ type: "product_list", products: [{ id: "prd_1", stock: 2 }] });
  });

  it("reports none currently low on stock", async () => {
    const { env } = fakeEnv([{ first: { count: 0 } }, { all: [] }]);
    const ctx = fakeContext(env);

    const result = await getLowStockProductsTool.run({ pageSize: 10 }, ctx);

    expect(result.message).toMatch(/no products are currently low on stock/i);
  });
});

describe("getOutOfStockProductsTool", () => {
  it("lists products with zero stock", async () => {
    const outOfStockRow = { ...PRODUCT_ROW, stock: 0 };
    const { env } = fakeEnv([{ first: { count: 1 } }, { all: [outOfStockRow] }]);
    const ctx = fakeContext(env);

    const result = await getOutOfStockProductsTool.run({ pageSize: 10 }, ctx);

    expect(result.artifact).toMatchObject({ type: "product_list", products: [{ id: "prd_1", stock: 0 }] });
  });

  it("reports none out of stock", async () => {
    const { env } = fakeEnv([{ first: { count: 0 } }, { all: [] }]);
    const ctx = fakeContext(env);

    const result = await getOutOfStockProductsTool.run({ pageSize: 10 }, ctx);

    expect(result.message).toMatch(/no products are out of stock/i);
  });
});
