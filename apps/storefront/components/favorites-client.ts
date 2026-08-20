"use client";

import type { Product } from "@aether/schemas";
import {
  readFavoriteProducts as readFavoriteProductsById,
  isFavoriteProduct as isFavoriteProductById,
  toggleFavoriteProduct as toggleFavoriteProductById,
  removeFavoriteProduct as removeFavoriteProductById,
  migrateGuestFavoritesToCustomer as migrateGuestFavoritesToCustomerById
} from "@aether/storefront-default";
import type { CustomerSession } from "./customer-client";

// Thin adapter: not-yet-migrated app consumers (SiteHeader, ProductDetailClient,
// app/account/favorites/page.tsx, app/compare/page.tsx) still call these with a
// full CustomerSession, while @aether/storefront-default's functions take a
// bare customerId (the package has no Clerk/auth dependency). This keeps
// every existing call site working unchanged.
export function readFavoriteProducts(customer: CustomerSession | null) {
  return readFavoriteProductsById(customer?.id ?? null);
}

export function isFavoriteProduct(productId: string, customer: CustomerSession | null) {
  return isFavoriteProductById(productId, customer?.id ?? null);
}

export function toggleFavoriteProduct(product: Product, customer: CustomerSession | null) {
  return toggleFavoriteProductById(product, customer?.id ?? null);
}

export function removeFavoriteProduct(productId: string, customer: CustomerSession | null) {
  return removeFavoriteProductById(productId, customer?.id ?? null);
}

export function migrateGuestFavoritesToCustomer(customer: CustomerSession) {
  return migrateGuestFavoritesToCustomerById(customer.id);
}
