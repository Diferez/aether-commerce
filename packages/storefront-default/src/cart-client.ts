"use client";

import { calculateCartTotals } from "@aether/core";
import type { Address, Cart, CartItem, Product } from "@aether/schemas";

export type CheckoutSessionResult = {
  success: boolean;
  data?: { checkoutUrl: string };
  error?: { code: string; message: string };
};

// Versioned so a catalog-source migration (e.g. Platzi -> DummyJSON, where
// product IDs are not comparable across sources) never resurrects stale
// cart data under a new schema.
const cartIdKey = "aether.cartId.dummyjson.v2";
const cartTokenKey = "aether.cartToken.dummyjson.v2";
const localCartKey = "aether.localCartItems.dummyjson.v1";
const cartApiTimeoutMs = 5000;

// Bound to a single apiBaseUrl so the reference app and every generated
// client's own apps/storefront/components/cart-client.ts shim can each pin
// their own resolved API URL, while CartProvider (which doesn't know
// apiBaseUrl until it reads useStorefrontConfig()) builds its own instance
// at render time.
export function createCartClient(apiBaseUrl: string) {
  async function fetchCartApi(input: RequestInfo | URL, init?: RequestInit) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), cartApiTimeoutMs);

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function getCartId() {
    const existing = window.localStorage.getItem(cartIdKey);
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem(cartIdKey, next);
    return next;
  }

  async function getCartCredentials() {
    const existingToken = window.sessionStorage.getItem(cartTokenKey);
    const existingCartId = window.localStorage.getItem(cartIdKey);
    if (existingToken && existingCartId) {
      return { cartId: existingCartId, token: existingToken };
    }

    const provisionalCartId = getCartId();

    try {
      const response = await fetchCartApi(`${apiBaseUrl}/api/v1/cart/session`, { method: "POST" });
      const payload = (await response.json()) as {
        success?: boolean;
        data?: { cartId?: string; token?: string };
      };
      const cartId = payload.data?.cartId;
      const token = payload.data?.token;
      if (!response.ok || !payload.success || !cartId || !token) {
        throw new Error("Cart session unavailable.");
      }
      window.localStorage.setItem(cartIdKey, cartId);
      window.sessionStorage.setItem(cartTokenKey, token);
      return { cartId, token };
    } catch {
      return { cartId: provisionalCartId, token: "" };
    }
  }

  async function getCartToken() {
    return (await getCartCredentials()).token;
  }

  function cartMutationHeaders(token: string) {
    return {
      "content-type": "application/json",
      ...(token ? { "x-aether-cart-token": token } : {})
    };
  }

  function productToCartItem(product: Product, variantId?: string): CartItem {
    const variant = (variantId ? product.variants.find((candidate) => candidate.id === variantId) : undefined) ?? product.variants[0];
    const finalUnitPrice = product.finalPrice + (variant?.priceDelta ?? 0);

    return {
      productId: product.id,
      variantId: variant?.id,
      quantity: 1,
      name: product.name,
      slug: product.slug,
      imageUrl: product.images[0]?.url ?? product.thumbnail,
      unitPrice: product.price,
      finalUnitPrice,
      lineTotal: finalUnitPrice,
      currency: "USD"
    };
  }

  function readLocalItems(): CartItem[] {
    try {
      return JSON.parse(window.localStorage.getItem(localCartKey) || "[]") as CartItem[];
    } catch {
      return [];
    }
  }

  function writeLocalItems(items: CartItem[]) {
    window.localStorage.setItem(localCartKey, JSON.stringify(items));
    window.dispatchEvent(new Event("aether-cart-changed"));
  }

  function readLocalCartItems() {
    return readLocalItems();
  }

  // Overwrites the local cache with the server's authoritative cart items.
  // Needed after a mutation made directly against the API (add, remove,
  // update, clear) that never touched this local cache, so anything reading
  // it (FloatingCart, SiteHeader) would keep showing stale items otherwise.
  function replaceLocalCartItems(items: CartItem[]) {
    writeLocalItems(items);
  }

  function readLocalCart(cartId = getCartId()): Cart {
    const items = readLocalItems();
    return {
      id: cartId,
      items,
      totals: calculateCartTotals(items),
      updatedAt: new Date().toISOString()
    };
  }

  function saveLocalCartItem(product: Product, variantId?: string) {
    const item = productToCartItem(product, variantId);
    const items = readLocalItems();
    const existing = items.find((candidate) => candidate.productId === item.productId && candidate.variantId === item.variantId);
    const nextItems = existing
      ? items.map((candidate) =>
          candidate.productId === item.productId && candidate.variantId === item.variantId
            ? {
                ...candidate,
                quantity: Math.min(25, candidate.quantity + 1),
                lineTotal: candidate.finalUnitPrice * Math.min(25, candidate.quantity + 1)
              }
            : candidate
        )
      : [...items, item];

    writeLocalItems(nextItems);
  }

  function removeLocalCartItem(itemId: string) {
    writeLocalItems(
      readLocalItems().filter((item) => item.productId !== itemId && item.variantId !== itemId && item.slug !== itemId)
    );
  }

  function updateLocalItemQuantity(itemId: string, quantity: number) {
    const clamped = Math.min(25, Math.max(1, Math.round(quantity)));
    writeLocalItems(
      readLocalItems().map((item) =>
        item.productId === itemId || item.variantId === itemId || item.slug === itemId
          ? { ...item, quantity: clamped, lineTotal: item.finalUnitPrice * clamped }
          : item
      )
    );
  }

  async function updateCartItemQuantity(itemId: string, quantity: number) {
    updateLocalItemQuantity(itemId, quantity);

    try {
      const { cartId, token } = await getCartCredentials();
      const response = await fetchCartApi(`${apiBaseUrl}/api/v1/cart/${cartId}/items/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: cartMutationHeaders(token),
        body: JSON.stringify({ quantity: Math.min(25, Math.max(1, Math.round(quantity))) })
      });
      const payload = (await response.json()) as { success?: boolean };
      if (!response.ok || !payload.success) {
        throw new Error("Cart API rejected quantity update.");
      }
      return "synced" as const;
    } catch {
      return "local" as const;
    }
  }

  async function removeProductFromCart(itemId: string) {
    removeLocalCartItem(itemId);

    try {
      const { cartId, token } = await getCartCredentials();
      const response = await fetchCartApi(`${apiBaseUrl}/api/v1/cart/${cartId}/items/${encodeURIComponent(itemId)}`, {
        method: "DELETE",
        headers: cartMutationHeaders(token)
      });
      const payload = (await response.json()) as { success?: boolean };
      if (!response.ok || !payload.success) {
        throw new Error("Cart API rejected remove.");
      }
      return "synced" as const;
    } catch {
      return "local" as const;
    }
  }

  async function addProductToCart(product: Product, variantId?: string) {
    const item = productToCartItem(product, variantId);
    saveLocalCartItem(product, variantId);

    try {
      const { cartId, token } = await getCartCredentials();
      const response = await fetchCartApi(`${apiBaseUrl}/api/v1/cart/${cartId}/items`, {
        method: "POST",
        headers: cartMutationHeaders(token),
        body: JSON.stringify({
          productId: item.slug,
          variantId: item.variantId,
          quantity: 1
        })
      });
      const payload = (await response.json()) as { success?: boolean };
      if (!response.ok || !payload.success) {
        throw new Error("Cart API rejected item");
      }
      return "synced" as const;
    } catch {
      return "local" as const;
    }
  }

  async function addProductReferenceToCart(input: { slug: string; variantId?: string | null; quantity?: number }) {
    const { cartId, token } = await getCartCredentials();
    const response = await fetchCartApi(`${apiBaseUrl}/api/v1/cart/${cartId}/items`, {
      method: "POST",
      headers: cartMutationHeaders(token),
      body: JSON.stringify({
        productId: input.slug,
        variantId: input.variantId || undefined,
        quantity: input.quantity ?? 1
      })
    });
    const payload = (await response.json()) as { success?: boolean; data?: Cart };
    if (!response.ok || !payload.success || !payload.data) {
      throw new Error("Cart API rejected item");
    }
    writeLocalItems(payload.data.items);
    return "synced" as const;
  }

  async function syncLocalCartToApi() {
    const { cartId, token } = await getCartCredentials();
    const items = readLocalItems();

    for (const item of items) {
      const response = await fetchCartApi(`${apiBaseUrl}/api/v1/cart/${cartId}/items`, {
        method: "POST",
        headers: cartMutationHeaders(token),
        body: JSON.stringify({
          productId: item.slug,
          variantId: item.variantId,
          quantity: item.quantity
        })
      });
      const payload = (await response.json()) as { success?: boolean };
      if (!response.ok || !payload.success) {
        throw new Error("Could not sync local cart.");
      }
    }
  }

  async function applyCartCoupon(code: string) {
    const { cartId, token } = await getCartCredentials();
    const response = await fetchCartApi(`${apiBaseUrl}/api/v1/cart/${cartId}/coupon`, {
      method: "POST",
      headers: cartMutationHeaders(token),
      body: JSON.stringify({ code })
    });
    const payload = (await response.json()) as { success?: boolean };
    if (!response.ok || !payload.success) {
      throw new Error("Could not apply coupon.");
    }
  }

  // Shared by the cart page (shipping disabled or WhatsApp mode - no address
  // needed) and the /checkout page (shipping enabled - shippingAddress is
  // collected there first). Not wrapped in fetchCartApi's short timeout like
  // the rest of this file's mutations - creating a real Stripe/Wompi session
  // can legitimately take longer than a cart read/write.
  async function createCheckoutSession(
    getToken: () => Promise<string | null>,
    shippingAddress?: Address
  ): Promise<CheckoutSessionResult> {
    const { cartId, token: cartToken } = await getCartCredentials();
    const authToken = await getToken();
    const response = await fetch(`${apiBaseUrl}/api/v1/checkout/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        ...(cartToken ? { "x-aether-cart-token": cartToken } : {})
      },
      body: JSON.stringify({ cartId, ...(shippingAddress ? { shippingAddress } : {}) })
    });
    return (await response.json()) as CheckoutSessionResult;
  }

  return {
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
  };
}

export type CartClient = ReturnType<typeof createCartClient>;
