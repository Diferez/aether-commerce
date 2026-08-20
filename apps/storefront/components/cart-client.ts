"use client";

import { createCartClient } from "@aether/storefront-default";
import { apiBaseUrl } from "./config";

export const {
  getCartId,
  getCartCredentials,
  getCartToken,
  readLocalCart,
  readLocalCartItems,
  replaceLocalCartItems,
  addProductToCart,
  addProductReferenceToCart,
  removeProductFromCart,
  updateCartItemQuantity,
  syncLocalCartToApi,
  applyCartCoupon,
  createCheckoutSession
} = createCartClient(apiBaseUrl);

export type { CheckoutSessionResult } from "@aether/storefront-default";
