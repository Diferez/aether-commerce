import { describe, expect, it } from "vitest";
import type { Env } from "../types";
import { __testables } from "./catalog";

const { normalizeLocal, flagsFor, foldText, typedLocalProducts } = __testables;

const testEnv = { APP_ORIGIN_STORE: "https://store.example" } as Env;

type LocalProduct = Parameters<typeof normalizeLocal>[1];

function makeLocalProduct(overrides: Partial<LocalProduct> = {}): LocalProduct {
  return {
    id: "prd_0042",
    sku: "MOB-FUND-0042",
    slug: "funda-slim-grip",
    name: "Funda Slim Grip",
    brand: "Halven",
    category: "mobile-accessories",
    subcategory: "fundas",
    price: 19,
    currency: "USD",
    stock: 34,
    rating: 4.6,
    reviewCount: 128,
    shortDescription: "Cubre los bordes sin anadir bulto.",
    description: "Cubre los bordes y las camaras sin anadir bulto notable al bolsillo.",
    highlights: ["Material: Policarbonato", "Peso: 32 g", "Disponible en 5 colores"],
    specs: { Material: "Policarbonato con borde de TPU", Peso: "32 g" },
    tags: ["funda", "proteccion", "accesorio-celular"],
    variants: [{ type: "color", options: ["Negro", "Grafito", "Arena"] }],
    images: { main: "/products/funda-slim-grip-1.webp", gallery: ["/products/funda-slim-grip-2.webp", "/products/funda-slim-grip-3.webp"] },
    imagePrompt: "a black phone case, studio photography",
    featured: false,
    isNew: false,
    createdAt: "2025-03-10",
    ...overrides
  };
}

describe("catalog.normalizeLocal", () => {
  it("maps a local catalog product onto the Aether Product contract", () => {
    const product = normalizeLocal(testEnv, makeLocalProduct());

    expect(product.id).toBe("prd_0042");
    expect(product.externalId).toBeNull();
    expect(product.sourceId).toBe("42");
    expect(product.slug).toBe("funda-slim-grip");
    expect(product.catalogSource).toBe("local");
    expect(product.brand).toBe("Halven");
    expect(product.sku).toBe("MOB-FUND-0042");
    expect(product.category.slug).toBe("mobile-accessories");
    expect(product.category.name).toBe("Mobile Accessories");
  });

  it("converts the dollar price to integer cents", () => {
    const product = normalizeLocal(testEnv, makeLocalProduct({ price: 19 }));
    expect(product.finalPrice).toBe(1900);
    expect(Number.isInteger(product.finalPrice)).toBe(true);
  });

  it("swaps price direction: local price -> finalPrice, compareAtPrice -> price/originalPrice", () => {
    // The local catalog's `price` is what the customer actually pays;
    // compareAtPrice (when present) is the higher, struck-through reference.
    // The shared Product contract expects the opposite - price = pre-discount,
    // finalPrice = what's charged - so this must land inverted.
    const product = normalizeLocal(testEnv, makeLocalProduct({ price: 19, compareAtPrice: 25 }));
    expect(product.finalPrice).toBe(1900);
    expect(product.price).toBe(2500);
    expect(product.originalPrice).toBe(2500);
    expect(product.discountPercentage).toBe(24);
  });

  it("has no discount and no originalPrice when compareAtPrice is absent", () => {
    const product = normalizeLocal(testEnv, makeLocalProduct({ price: 19 }));
    expect(product.price).toBe(1900);
    expect(product.originalPrice).toBeNull();
    expect(product.discountPercentage).toBe(0);
  });

  it("uses the catalog's own stock directly as availableStock", () => {
    const product = normalizeLocal(testEnv, makeLocalProduct({ stock: 0 }));
    expect(product.availableStock).toBe(0);
    expect(product.availabilityStatus).toBe("out_of_stock");
  });

  it("builds absolute image URLs from APP_ORIGIN_STORE and tags them as local", () => {
    const product = normalizeLocal(testEnv, makeLocalProduct());
    expect(product.images).toHaveLength(3);
    expect(product.images[0]?.url).toBe("https://store.example/products/funda-slim-grip-1.webp");
    expect(product.images.every((image) => image.source === "local")).toBe(true);
    expect(product.thumbnail).toBe("https://store.example/products/funda-slim-grip-1.webp");
  });

  it("falls back to http://localhost:3000 when APP_ORIGIN_STORE is unset", () => {
    const product = normalizeLocal({} as Env, makeLocalProduct());
    expect(product.thumbnail.startsWith("http://localhost:3000/products/")).toBe(true);
  });

  it("maps specs to the specifications array", () => {
    const product = normalizeLocal(testEnv, makeLocalProduct());
    expect(product.specifications).toEqual([
      { key: "Material", value: "Policarbonato con borde de TPU" },
      { key: "Peso", value: "32 g" }
    ]);
  });

  it("normalizes every generated catalog product without throwing", () => {
    for (const product of typedLocalProducts) {
      expect(() => normalizeLocal(testEnv, product)).not.toThrow();
    }
  });
});

describe("catalog.flagsFor", () => {
  it("derives flags from the product's own featured/isNew/compareAtPrice/stock fields", () => {
    expect(flagsFor(makeLocalProduct({ featured: true }))).toContain("featured");
    expect(flagsFor(makeLocalProduct({ isNew: true }))).toContain("new");
    expect(flagsFor(makeLocalProduct({ compareAtPrice: 30 }))).toContain("deal");
    expect(flagsFor(makeLocalProduct({ stock: 3 }))).toContain("limited");
  });

  it("always returns at least one flag", () => {
    const flags = flagsFor(makeLocalProduct({ featured: false, isNew: false, stock: 50 }));
    expect(flags.length).toBeGreaterThan(0);
  });
});

describe("catalog.foldText", () => {
  it("lowercases and strips accents for accent-insensitive search", () => {
    expect(foldText("Cámara")).toBe("camara");
    expect(foldText("Organización")).toBe("organizacion");
  });
});
