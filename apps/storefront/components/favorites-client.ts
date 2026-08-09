"use client";

import type { Product } from "@aether/schemas";
import type { CustomerSession } from "./customer-client";

// Versioned for the same reason as cart-client.ts's keys - see legacy-storage.ts.
const guestFavoritesKey = "aether.favoritesItems.guest.dummyjson.v1";

function favoritesKey(customer: CustomerSession | null) {
  return customer ? `aether.favoritesItems.${customer.id}.dummyjson.v1` : guestFavoritesKey;
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
}

export function readFavoriteProducts(customer: CustomerSession | null) {
  return readProductsFromKey(favoritesKey(customer));
}

export function isFavoriteProduct(productId: string, customer: CustomerSession | null) {
  return readFavoriteProducts(customer).some((product) => product.id === productId);
}

export function toggleFavoriteProduct(product: Product, customer: CustomerSession | null) {
  const key = favoritesKey(customer);
  const products = readProductsFromKey(key);
  const exists = products.some((candidate) => candidate.id === product.id);
  const nextProducts = exists ? products.filter((candidate) => candidate.id !== product.id) : [product, ...products];
  writeProductsToKey(key, nextProducts);
  window.dispatchEvent(new Event("aether-favorites-changed"));
  return exists ? "removed" : "added";
}

export function removeFavoriteProduct(productId: string, customer: CustomerSession | null) {
  const key = favoritesKey(customer);
  writeProductsToKey(
    key,
    readProductsFromKey(key).filter((product) => product.id !== productId)
  );
  window.dispatchEvent(new Event("aether-favorites-changed"));
}

export function migrateGuestFavoritesToCustomer(customer: CustomerSession) {
  const guestProducts = readProductsFromKey(guestFavoritesKey);
  if (guestProducts.length === 0) return;

  const key = favoritesKey(customer);
  const customerProducts = readProductsFromKey(key);
  const merged = [
    ...customerProducts,
    ...guestProducts.filter((product) => !customerProducts.some((candidate) => candidate.id === product.id))
  ];

  writeProductsToKey(key, merged);
  writeProductsToKey(guestFavoritesKey, []);
  window.dispatchEvent(new Event("aether-favorites-changed"));
}
