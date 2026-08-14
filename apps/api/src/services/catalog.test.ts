import { describe, expect, it } from "vitest";
import type { Env } from "../types";
import { __testables, type ProductRow } from "./catalog";

const { normalizeRow, flagsFor, foldText } = __testables;

const testEnv = { APP_ORIGIN_STORE: "https://store.example" } as Env;

function makeProductRow(overrides: Partial<ProductRow> = {}): ProductRow {
  const details = {
    shortDescription: "Cubre los bordes sin anadir bulto.",
    description: "Cubre los bordes y las camaras sin anadir bulto notable al bolsillo.",
    highlights: ["Material: Policarbonato", "Peso: 32 g", "Disponible en 5 colores"],
    specs: { Material: "Policarbonato con borde de TPU", Peso: "32 g" },
    tags: ["funda", "proteccion", "accesorio-celular"],
    variants: [{ type: "color", options: ["Negro", "Grafito", "Arena"] }],
    images: {
      main: "/products/funda-slim-grip-1.webp",
      gallery: ["/products/funda-slim-grip-2.webp", "/products/funda-slim-grip-3.webp"]
    },
    imagePrompt: "a black phone case, studio photography"
  };
  return {
    id: "prd_0042",
    sku: "MOB-FUND-0042",
    slug: "funda-slim-grip",
    name: "Funda Slim Grip",
    brand: "Halven",
    category: "mobile-accessories",
    subcategory: "fundas",
    price_cents: 1900,
    compare_at_price_cents: null,
    final_price_cents: 1900,
    stock: 34,
    low_stock_threshold: 4,
    visibility: "visible",
    featured: 0,
    is_new: 0,
    is_deal: 0,
    rating_average: 4.6,
    rating_count: 128,
    details_json: JSON.stringify(details),
    created_at: "2025-03-10T00:00:00.000Z",
    updated_at: "2025-03-10T00:00:00.000Z",
    ...overrides
  };
}

describe("catalog.normalizeRow", () => {
  it("maps a products row onto the Aether Product contract", () => {
    const product = normalizeRow(testEnv, makeProductRow());

    expect(product.id).toBe("prd_0042");
    expect(product.externalId).toBeNull();
    expect(product.sourceId).toBe("prd_0042");
    expect(product.slug).toBe("funda-slim-grip");
    expect(product.catalogSource).toBe("local");
    expect(product.brand).toBe("Halven");
    expect(product.sku).toBe("MOB-FUND-0042");
    expect(product.category.slug).toBe("mobile-accessories");
    expect(product.category.name).toBe("Mobile Accessories");
  });

  it("keeps final_price_cents as an integer-cents finalPrice", () => {
    const product = normalizeRow(testEnv, makeProductRow({ final_price_cents: 1900 }));
    expect(product.finalPrice).toBe(1900);
    expect(Number.isInteger(product.finalPrice)).toBe(true);
  });

  it("uses compare_at_price_cents as the struck-through price/originalPrice", () => {
    const product = normalizeRow(
      testEnv,
      makeProductRow({ final_price_cents: 1900, compare_at_price_cents: 2500, price_cents: 2500 })
    );
    expect(product.finalPrice).toBe(1900);
    expect(product.price).toBe(2500);
    expect(product.originalPrice).toBe(2500);
    expect(product.discountPercentage).toBe(24);
  });

  it("has no discount and no originalPrice when compare_at_price_cents is absent", () => {
    const product = normalizeRow(testEnv, makeProductRow({ final_price_cents: 1900, compare_at_price_cents: null }));
    expect(product.price).toBe(1900);
    expect(product.originalPrice).toBeNull();
    expect(product.discountPercentage).toBe(0);
  });

  it("uses the row's own stock directly as availableStock", () => {
    const product = normalizeRow(testEnv, makeProductRow({ stock: 0 }));
    expect(product.availableStock).toBe(0);
    expect(product.availabilityStatus).toBe("out_of_stock");
  });

  it("reflects visibility onto both the visibility and visible fields", () => {
    expect(normalizeRow(testEnv, makeProductRow({ visibility: "visible" })).visible).toBe(true);
    expect(normalizeRow(testEnv, makeProductRow({ visibility: "draft" })).visible).toBe(false);
    expect(normalizeRow(testEnv, makeProductRow({ visibility: "hidden" })).visible).toBe(false);
  });

  it("builds absolute image URLs from APP_ORIGIN_STORE and tags bare paths as local", () => {
    const product = normalizeRow(testEnv, makeProductRow());
    expect(product.images).toHaveLength(3);
    expect(product.images[0]?.url).toBe("https://store.example/products/funda-slim-grip-1.webp");
    expect(product.images.every((image) => image.source === "local")).toBe(true);
    expect(product.thumbnail).toBe("https://store.example/products/funda-slim-grip-1.webp");
  });

  it("leaves absolute (Cloudinary) image URLs untouched and tags them accordingly", () => {
    const details = JSON.parse(makeProductRow().details_json) as { images: { main: string; gallery: string[] } };
    details.images.main = "https://res.cloudinary.com/demo/image/upload/v1/aether/funda-1.jpg";
    const product = normalizeRow(testEnv, makeProductRow({ details_json: JSON.stringify(details) }));
    expect(product.images[0]?.url).toBe("https://res.cloudinary.com/demo/image/upload/v1/aether/funda-1.jpg");
    expect(product.images[0]?.source).toBe("cloudinary");
  });

  it("falls back to http://localhost:3000 when APP_ORIGIN_STORE is unset", () => {
    const product = normalizeRow({} as Env, makeProductRow());
    expect(product.thumbnail.startsWith("http://localhost:3000/products/")).toBe(true);
  });

  it("maps specs to the specifications array", () => {
    const product = normalizeRow(testEnv, makeProductRow());
    expect(product.specifications).toEqual([
      { key: "Material", value: "Policarbonato con borde de TPU" },
      { key: "Peso", value: "32 g" }
    ]);
  });
});

describe("catalog.flagsFor", () => {
  it("derives flags from the row's own featured/is_new/is_deal/stock fields", () => {
    expect(flagsFor(makeProductRow({ featured: 1 }))).toContain("featured");
    expect(flagsFor(makeProductRow({ is_new: 1 }))).toContain("new");
    expect(flagsFor(makeProductRow({ is_deal: 1 }))).toContain("deal");
    expect(flagsFor(makeProductRow({ stock: 3, low_stock_threshold: 4 }))).toContain("limited");
  });

  it("does not flag limited once stock is above the row's own low_stock_threshold", () => {
    expect(flagsFor(makeProductRow({ stock: 10, low_stock_threshold: 4 }))).not.toContain("limited");
  });

  it("always returns at least one flag", () => {
    const flags = flagsFor(makeProductRow({ featured: 0, is_new: 0, is_deal: 0, stock: 50 }));
    expect(flags.length).toBeGreaterThan(0);
  });
});

describe("catalog.foldText", () => {
  it("lowercases and strips accents for accent-insensitive search", () => {
    expect(foldText("Cámara")).toBe("camara");
    expect(foldText("Organización")).toBe("organizacion");
  });
});
