"use client";

import type { Product } from "@aether-commerce/schemas";

// Versioned for the same reason as cart-client.ts's keys.
const guestFavoritesKey = "aether.favoritesItems.guest.dummyjson.v1";

// Scoped by customerId rather than a full customer/session object - only the
// id is ever needed to key the storage, and this package has no opinion on
// how an app resolves auth (Clerk, or anything else).
function favoritesKey(customerId: string | null) {
  return customerId ? `aether.favoritesItems.${customerId}.dummyjson.v1` : guestFavoritesKey;
}

function readProductsFromKey(key: string): Product[] {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "[]") as Product[];
  } catch {
    return [];
  }
}

function writeProductsToKey(key: string, products: Product[]) {
  window.localStorage.setItem(key, JSON.stringify(products));
  window.dispatchEvent(new Event("aether-favorites-changed"));
}

export function readFavoriteProducts(customerId: string | null) {
  return readProductsFromKey(favoritesKey(customerId));
}

export function isFavoriteProduct(productId: string, customerId: string | null) {
  return readFavoriteProducts(customerId).some((product) => product.id === productId);
}

export function toggleFavoriteProduct(product: Product, customerId: string | null) {
  const key = favoritesKey(customerId);
  const products = readProductsFromKey(key);
  const exists = products.some((candidate) => candidate.id === product.id);
  const nextProducts = exists ? products.filter((candidate) => candidate.id !== product.id) : [product, ...products];
  writeProductsToKey(key, nextProducts);
  window.dispatchEvent(new Event("aether-favorites-changed"));
  return exists ? "removed" : "added";
}

export function removeFavoriteProduct(productId: string, customerId: string | null) {
  const key = favoritesKey(customerId);
  writeProductsToKey(
    key,
    readProductsFromKey(key).filter((product) => product.id !== productId)
  );
  window.dispatchEvent(new Event("aether-favorites-changed"));
}

export function migrateGuestFavoritesToCustomer(customerId: string) {
  const guestProducts = readProductsFromKey(guestFavoritesKey);
  if (guestProducts.length === 0) return;

  const key = favoritesKey(customerId);
  const customerProducts = readProductsFromKey(key);
  const merged = [
    ...customerProducts,
    ...guestProducts.filter((product) => !customerProducts.some((candidate) => candidate.id === product.id))
  ];

  writeProductsToKey(key, merged);
  writeProductsToKey(guestFavoritesKey, []);
  window.dispatchEvent(new Event("aether-favorites-changed"));
}
