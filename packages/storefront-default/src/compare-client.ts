"use client";

import type { Product } from "@aether/schemas";

// Local-only: the real GET/POST/DELETE /compare routes require a signed-in
// session, but comparing products is a low-commitment, pre-purchase action a
// guest should be able to do without hitting a login wall. Not customer-
// scoped like favorites either - a comparison list is a short-lived,
// in-session tool, not something worth carrying across devices/logins.
const compareKey = "aether.compareItems.v1";

// Mirrors maximumComparisonProducts (packages/api-core/src/customers.ts),
// the cap the real /compare API enforces server-side - kept as a literal
// here rather than a dependency on api-core, which this package doesn't
// otherwise depend on.
const maximumComparisonProducts = 4;

function readProducts(): Product[] {
  try {
    return JSON.parse(window.localStorage.getItem(compareKey) || "[]") as Product[];
  } catch {
    return [];
  }
}

function writeProducts(products: Product[]) {
  window.localStorage.setItem(compareKey, JSON.stringify(products));
  window.dispatchEvent(new Event("aether-compare-changed"));
}

export function readCompareProducts() {
  return readProducts();
}

export function isCompareProduct(productId: string) {
  return readProducts().some((product) => product.id === productId);
}

export type ToggleCompareResult = "added" | "removed" | "full";

export function toggleCompareProduct(product: Product): ToggleCompareResult {
  const products = readProducts();
  const exists = products.some((candidate) => candidate.id === product.id);
  if (exists) {
    writeProducts(products.filter((candidate) => candidate.id !== product.id));
    return "removed";
  }
  if (products.length >= maximumComparisonProducts) {
    return "full";
  }
  writeProducts([...products, product]);
  return "added";
}

export function removeCompareProduct(productId: string) {
  writeProducts(readProducts().filter((product) => product.id !== productId));
}

export function clearCompareProducts() {
  writeProducts([]);
}
