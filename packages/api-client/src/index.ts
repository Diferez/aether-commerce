import type {
  ApiCollectionResponse,
  ApiResponse,
  Cart,
  CartItemInput,
  ContactMessage,
  Order,
  Product,
  ProductQuery
} from "@aether/schemas";

export type AetherClientOptions = {
  baseUrl: string;
  getToken?: () => Promise<string | undefined> | string | undefined;
};

export class AetherApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId?: string
  ) {
    super(message);
  }
}

export function createAetherClient(options: AetherClientOptions) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await options.getToken?.();
    const headers = new Headers(init?.headers);
    headers.set("accept", "application/json");

    if (init?.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers
    });
    const payload = (await response.json()) as ApiResponse<T>;

    if (!payload.success) {
      throw new AetherApiError(payload.error.message, payload.error.code, payload.meta.requestId);
    }

    return payload.data;
  }

  async function collection<T>(path: string, init?: RequestInit): Promise<ApiCollectionResponse<T>> {
    const token = await options.getToken?.();
    const headers = new Headers(init?.headers);
    headers.set("accept", "application/json");

    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers
    });

    return (await response.json()) as ApiCollectionResponse<T>;
  }

  return {
    products(query: ProductQuery) {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          params.set(key, String(value));
        }
      });
      return collection<Product>(`/api/v1/catalog/products?${params.toString()}`);
    },
    product(slug: string) {
      return request<Product>(`/api/v1/catalog/products/${encodeURIComponent(slug)}`);
    },
    getCart(cartId: string, cartToken: string) {
      return request<Cart>(`/api/v1/cart/${encodeURIComponent(cartId)}`, {
        headers: { "x-aether-cart-token": cartToken }
      });
    },
    addCartItem(cartId: string, item: CartItemInput, cartToken: string) {
      return request<Cart>(`/api/v1/cart/${encodeURIComponent(cartId)}/items`, {
        method: "POST",
        headers: { "x-aether-cart-token": cartToken },
        body: JSON.stringify(item)
      });
    },
    checkout(cartId: string) {
      return request<{ checkoutUrl: string }>(`/api/v1/checkout/session`, {
        method: "POST",
        body: JSON.stringify({ cartId })
      });
    },
    contact(message: ContactMessage) {
      return request<{ id: string; emailQueued: boolean }>(`/api/v1/contact`, {
        method: "POST",
        body: JSON.stringify(message)
      });
    },
    orders() {
      return collection<Order>("/api/v1/account/orders");
    }
  };
}
