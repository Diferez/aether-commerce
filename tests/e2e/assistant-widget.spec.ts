import { expect, test, type Page } from "@playwright/test";

async function openAssistant(page: Page) {
  // The Next dev overlay is not part of the application and sits above fixed
  // controls on the mobile viewport. It is absent from production builds.
  await page.locator("nextjs-portal").evaluateAll((portals) => portals.forEach((portal) => portal.remove()));
  const trigger = page.getByRole("button", { name: /assistant|asistente/i });
  await expect(trigger).toBeVisible();
  await trigger.click();
  return page.getByRole("dialog", { name: /assistant|asistente/i });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("aether.assistant.privacy.v1", "2026-08-12");
  });
});

test("assistant widget opens and renders structured product results", async ({ page }) => {
  await page.route("**/api/v1/cart/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { cartId: "cart-1", token: "test-cart-token" },
        meta: { requestId: "req_cart_token" }
      })
    });
  });
  await page.route("**/api/v1/cart/*/items", async (route) => {
    const payload = route.request().postDataJSON() as {
      productId?: string;
      variantId?: string;
      quantity?: number;
    };
    expect(payload).toMatchObject({
      productId: "everyday-runner-sneakers",
      variantId: "everyday-runner-sneakers-standard",
      quantity: 1
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "cart-1",
          items: [
            {
              productId: "dummyjson_9006",
              variantId: "everyday-runner-sneakers-standard",
              quantity: 1,
              name: "Everyday Runner Sneakers",
              slug: "everyday-runner-sneakers",
              imageUrl:
                "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
              unitPrice: 11900,
              finalUnitPrice: 11900,
              lineTotal: 11900,
              currency: "USD"
            }
          ],
          totals: { subtotal: 11900, discount: 0, shipping: 0, tax: 0, total: 11900 },
          updatedAt: "2026-07-21T00:00:00.000Z"
        },
        meta: { requestId: "req_add_item" }
      })
    });
  });

  await page.route("http://localhost:8090/v1/assistant/messages/stream", async (route) => {
    const headers = route.request().headers();
    expect(headers["x-aether-cart-token"]).toBe("test-cart-token");
    expect(route.request().postDataJSON()).toMatchObject({
      privacy_consent: true,
      privacy_version: "2026-08-12"
    });
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: assistant.started",
        "data: {}",
        "",
        "event: assistant.status",
        'data: {"message":"Buscando productos"}',
        "",
        "event: assistant.token",
        'data: {"text":"Encontre estas opciones reales en Aether."}',
        "",
        "event: assistant.completed",
        `data: ${JSON.stringify({
          request_id: "req_test",
          thread_id: "00000000-0000-4000-8000-000000000001",
          message: "Encontre estas opciones reales en Aether.",
          intent: "SEARCH_PRODUCTS",
          products: [
            {
              product_id: "dummyjson_9006",
              variant_id: "everyday-runner-sneakers-standard",
              name: "Everyday Runner Sneakers",
              description: "Lightweight sneakers built for daily movement.",
              price: "119",
              currency: "USD",
              image_url:
                "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
              product_url: "/products/detail?slug=everyday-runner-sneakers",
              available: true,
              color: "Red",
              size: "40",
              rating: 4.6
            }
          ],
          cart: {
            item_count: 2,
            subtotal: "119",
            currency: "USD",
            items: [{ slug: "everyday-runner-sneakers", quantity: 2 }]
          },
          action: {
            type: "CART_ITEM_ADDED",
            status: "SUCCEEDED",
            entity_id: "everyday-runner-sneakers",
            message: null
          },
          suggested_replies: ["Ver carrito", "Buscar ofertas"]
        })}`,
        "",
        ""
      ].join("\n")
    });
  });

  await page.goto("/");
  const assistant = await openAssistant(page);
  await assistant.getByPlaceholder(/buscar|search/i).fill("tenis rojos");
  await assistant.getByRole("button", { name: /enviar|send/i }).click();

  await expect(assistant.getByText("Everyday Runner Sneakers")).toBeVisible();
  await expect(assistant.getByText(/^(In stock|Disponible)$/)).toBeVisible();
  await expect(assistant.getByText(/^(Variant|Variante): Red \/ 40$/)).toBeVisible();
  await expect(page.getByText("Encontre estas opciones reales en Aether.")).toHaveCount(1);
  await expect(assistant.getByText(/2 (productos|items)/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /abrir carrito|open cart/i })).toHaveAttribute(
    "href",
    /\/cart/
  );
  await expect(
    assistant.getByRole("button", { name: /buscar ofertas|search deals/i }).first()
  ).toBeVisible();
  await expect(assistant.getByRole("link", { name: /^(ver|view)$/i })).toHaveAttribute(
    "href",
    /products\/everyday-runner-sneakers\//
  );

  await assistant.getByRole("button", { name: /^agregar$|^add$/i }).click();
  await expect(page.getByRole("status")).toContainText(/agregado al carrito|added to cart/i);
});

test("assistant widget sends current product context from detail pages", async ({ page }) => {
  await page.route("**/api/v1/cart/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { cartId: "cart-1", token: "test-cart-token" },
        meta: { requestId: "req_cart_token" }
      })
    });
  });

  await page.route("http://localhost:8090/v1/assistant/messages/stream", async (route) => {
    const payload = route.request().postDataJSON() as {
      client_context?: {
        current_path?: string;
        current_category?: string | null;
        current_product_slug?: string | null;
      };
    };

    expect(payload.client_context?.current_path).toMatch(/^\/products\/funda-slim-grip\/?$/);
    expect(payload.client_context?.current_product_slug).toBe("funda-slim-grip");
    expect(payload.client_context?.current_category).toBeNull();

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: assistant.completed",
        `data: ${JSON.stringify({
          request_id: "req_context",
          thread_id: "00000000-0000-4000-8000-000000000002",
          message: "Busque alternativas similares segun este producto.",
          intent: "RECOMMEND_PRODUCTS",
          products: [],
          cart: null,
          action: {
            type: "NONE",
            status: "NOT_REQUESTED",
            entity_id: null,
            message: null
          },
          suggested_replies: []
        })}`,
        "",
        ""
      ].join("\n")
    });
  });

  await page.goto("/products/funda-slim-grip/");
  const assistant = await openAssistant(page);
  await assistant.getByPlaceholder(/buscar|search/i).fill("Muestrame alternativas similares");
  await assistant.getByRole("button", { name: /enviar|send/i }).click();

  await expect(page.getByText("Busque alternativas similares segun este producto.")).toBeVisible();
});

test("assistant widget renders product cards from streaming product events", async ({ page }) => {
  await page.route("**/api/v1/cart/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { cartId: "cart-1", token: "test-cart-token" },
        meta: { requestId: "req_cart_token" }
      })
    });
  });

  await page.route("http://localhost:8090/v1/assistant/messages/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: assistant.started",
        "data: {}",
        "",
        "event: assistant.status",
        'data: {"message":"Buscando productos"}',
        "",
        "event: assistant.products",
        `data: ${JSON.stringify([
          {
            product_id: "stream-product-1",
            variant_id: "stream-product-1-standard",
            name: "Streamed Runner",
            description: "Rendered before the completed payload.",
            price: "79",
            currency: "USD",
            image_url: null,
            product_url: "/products/detail?slug=streamed-runner",
            available: true,
            color: "Blue",
            size: "42",
            rating: null
          }
        ])}`,
        "",
        "event: assistant.token",
        'data: {"text":"Estas opciones ya estan disponibles."}',
        "",
        ""
      ].join("\n")
    });
  });

  await page.goto("/");
  const assistant = await openAssistant(page);
  await assistant.getByPlaceholder(/buscar|search/i).fill("Muestrame opciones");
  await assistant.getByRole("button", { name: /enviar|send/i }).click();

  await expect(assistant.getByText("Streamed Runner")).toBeVisible();
  await expect(assistant.getByText(/Blue \/ 42/)).toBeVisible();
  await expect(assistant.getByText("Estas opciones ya estan disponibles.")).toBeVisible();
});

test("assistant widget renders cart summary from streaming cart events", async ({ page }) => {
  await page.route("**/api/v1/cart/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { cartId: "cart-1", token: "test-cart-token" },
        meta: { requestId: "req_cart_token" }
      })
    });
  });

  await page.route("http://localhost:8090/v1/assistant/messages/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: assistant.started",
        "data: {}",
        "",
        "event: assistant.cart_updated",
        `data: ${JSON.stringify({
          item_count: 1,
          subtotal: "79",
          currency: "USD",
          items: [{ slug: "streamed-runner", quantity: 1 }]
        })}`,
        "",
        "event: assistant.token",
        'data: {"text":"Agregue el producto al carrito."}',
        "",
        ""
      ].join("\n")
    });
  });

  await page.goto("/");
  const assistant = await openAssistant(page);
  await assistant.getByPlaceholder(/buscar|search/i).fill("Agrega el primero");
  await assistant.getByRole("button", { name: /enviar|send/i }).click();

  await expect(assistant.getByText("Agregue el producto al carrito.")).toBeVisible();
  await expect(assistant.getByText(/1 (productos|items)/i)).toBeVisible();
  await expect(assistant.getByRole("link", { name: /abrir carrito|open cart/i })).toHaveAttribute(
    "href",
    /\/cart/
  );
});

test("assistant widget supports keyboard close and returns focus", async ({ page }) => {
  await page.goto("/");

  const trigger = page.getByRole("button", { name: /assistant|asistente/i });
  const assistant = await openAssistant(page);
  await expect(assistant).toBeVisible();
  await expect(assistant.getByPlaceholder(/buscar|search/i)).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(assistant).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("assistant widget handles malformed stream events safely", async ({ page }) => {
  await page.route("**/api/v1/cart/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { cartId: "cart-1", token: "test-cart-token" },
        meta: { requestId: "req_cart_token" }
      })
    });
  });

  await page.route("http://localhost:8090/v1/assistant/messages/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: assistant.completed",
        "data: {invalid-json: stacktrace GEMINI_API_KEY}",
        "",
        ""
      ].join("\n")
    });
  });

  await page.goto("/");
  const assistant = await openAssistant(page);
  await assistant.getByPlaceholder(/buscar|search/i).fill("Hola");
  await assistant.getByRole("button", { name: /enviar|send/i }).click();

  await expect(assistant).toContainText(/no pude conectar|could not reach/i);
  await expect(assistant).not.toContainText("GEMINI_API_KEY");
  await expect(assistant).not.toContainText("stacktrace");
});

test("assistant widget ignores malformed streaming cart summaries", async ({ page }) => {
  await page.route("**/api/v1/cart/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { cartId: "cart-1", token: "test-cart-token" },
        meta: { requestId: "req_cart_token" }
      })
    });
  });

  await page.route("http://localhost:8090/v1/assistant/messages/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: assistant.cart_updated",
        `data: ${JSON.stringify({
          item_count: "1",
          subtotal: 79,
          currency: "USD",
          items: "invalid"
        })}`,
        "",
        "event: assistant.token",
        'data: {"text":"Estoy revisando el carrito con datos seguros."}',
        "",
        ""
      ].join("\n")
    });
  });

  await page.goto("/");
  const assistant = await openAssistant(page);
  await assistant.getByPlaceholder(/buscar|search/i).fill("Revisa mi carrito");
  await assistant.getByRole("button", { name: /enviar|send/i }).click();

  await expect(assistant.getByText("Estoy revisando el carrito con datos seguros.")).toBeVisible();
  await expect(assistant.getByRole("link", { name: /abrir carrito|open cart/i })).toHaveCount(0);
  await expect(assistant.getByText(/1 (productos|items)/i)).toHaveCount(0);
});

test("assistant widget renders unavailable product cards without cart mutation", async ({
  page
}) => {
  await page.route("**/api/v1/cart/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { cartId: "cart-1", token: "test-cart-token" },
        meta: { requestId: "req_cart_token" }
      })
    });
  });
  await page.route("**/api/v1/cart/*/items", async (route) => {
    throw new Error(`Unavailable products should not call cart mutation: ${route.request().url()}`);
  });
  await page.route("http://localhost:8090/v1/assistant/messages/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: assistant.completed",
        `data: ${JSON.stringify({
          request_id: "req_unavailable",
          thread_id: "00000000-0000-4000-8000-000000000004",
          message: "Este producto no esta disponible.",
          intent: "SEARCH_PRODUCTS",
          products: [
            {
              product_id: "sold-out-1",
              variant_id: null,
              name: "Sold Out Runner",
              description: "Unavailable test product.",
              price: "89",
              currency: "USD",
              image_url: null,
              product_url: "/products/detail?slug=sold-out-runner",
              available: false,
              color: "Black",
              size: "41",
              rating: null
            }
          ],
          cart: null,
          action: {
            type: "NONE",
            status: "NOT_REQUESTED",
            entity_id: null,
            message: null
          },
          suggested_replies: []
        })}`,
        "",
        ""
      ].join("\n")
    });
  });

  await page.goto("/");
  const assistant = await openAssistant(page);
  await assistant.getByPlaceholder(/buscar|search/i).fill("Busca agotados");
  await assistant.getByRole("button", { name: /enviar|send/i }).click();

  await expect(assistant.getByText("Sold Out Runner")).toBeVisible();
  await expect(assistant.getByText(/^(Out of stock|Agotado)$/)).toBeVisible();
  await expect(assistant.getByText(/Black \/ 41/)).toBeVisible();
  await expect(assistant.getByRole("button", { name: /^agregar$|^add$/i })).toBeDisabled();
});

test("assistant widget sends current category context from category pages", async ({ page }) => {
  await page.route("**/api/v1/cart/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { cartId: "cart-1", token: "test-cart-token" },
        meta: { requestId: "req_cart_token" }
      })
    });
  });

  await page.route("http://localhost:8090/v1/assistant/messages/stream", async (route) => {
    const payload = route.request().postDataJSON() as {
      client_context?: {
        current_path?: string;
        current_category?: string | null;
        current_product_slug?: string | null;
      };
    };

    expect(payload.client_context?.current_path).toMatch(
      /^\/categories\/smartphones\/?\?category=smartphones$/
    );
    expect(payload.client_context?.current_category).toBe("smartphones");
    expect(payload.client_context?.current_product_slug).toBeNull();

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: assistant.completed",
        `data: ${JSON.stringify({
          request_id: "req_category_context",
          thread_id: "00000000-0000-4000-8000-000000000003",
          message: "Busque productos dentro de esta categoria.",
          intent: "SEARCH_PRODUCTS",
          products: [],
          cart: null,
          action: {
            type: "NONE",
            status: "NOT_REQUESTED",
            entity_id: null,
            message: null
          },
          suggested_replies: []
        })}`,
        "",
        ""
      ].join("\n")
    });
  });

  await page.goto("/categories/smartphones");
  const assistant = await openAssistant(page);
  await assistant.getByPlaceholder(/buscar|search/i).fill("Muestrame productos similares");
  await assistant.getByRole("button", { name: /enviar|send/i }).click();

  await expect(page.getByText("Busque productos dentro de esta categoria.")).toBeVisible();
});

test("assistant widget renders authenticated order summaries", async ({ page }) => {
  await page.route("**/api/v1/cart/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { cartId: "cart-1", token: "test-cart-token" },
        meta: { requestId: "req_cart_token" }
      })
    });
  });

  await page.route("http://localhost:8090/v1/assistant/messages/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: assistant.completed",
        `data: ${JSON.stringify({
          request_id: "req_orders",
          thread_id: "00000000-0000-4000-8000-000000000005",
          message: "Encontre tu pedido mas reciente.",
          intent: "GET_ORDER_STATUS",
          products: [],
          cart: null,
          orders: [
            {
              id: "ord_5001",
              number: "AET-5001",
              state: "shipped",
              item_count: 2,
              total: "149.99",
              currency: "USD",
              created_at: "2026-08-10T12:00:00.000Z"
            }
          ],
          action: {
            type: "OPEN_ORDERS",
            status: "SUCCEEDED",
            entity_id: "ord_5001",
            message: null
          },
          suggested_replies: ["Ver mis pedidos"]
        })}`,
        "",
        ""
      ].join("\n")
    });
  });

  await page.goto("/");
  const assistant = await openAssistant(page);
  await assistant.getByPlaceholder(/buscar|search/i).fill("Estado de mi compra");
  await assistant.getByRole("button", { name: /enviar|send/i }).click();

  await expect(assistant.getByText("AET-5001")).toBeVisible();
  await expect(assistant.getByText("shipped")).toBeVisible();
  await expect(assistant.getByText(/2 (productos|items)/i)).toBeVisible();
  await expect(assistant.getByRole("link", { name: /ver pedidos|view orders/i })).toHaveAttribute(
    "href",
    /\/account\/orders/
  );
});

test("assistant widget opens as a full screen mobile dialog", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile-only assistant layout check");

  await page.goto("/");
  await openAssistant(page);

  const assistant = page.getByRole("dialog", { name: /assistant|asistente/i });
  await expect(assistant).toBeVisible();

  const dialogBox = await assistant.boundingBox();
  const viewport = page.viewportSize();

  expect(dialogBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(dialogBox!.width).toBeGreaterThanOrEqual(viewport!.width - 4);
  expect(dialogBox!.height).toBeGreaterThanOrEqual(viewport!.height - 4);
  await expect(assistant.getByPlaceholder(/buscar|search/i)).toBeFocused();
});

// On mobile the dialog covers the whole viewport (see the test above), so a
// customer who taps a product's "View" link with no visual feedback that the
// dialog closed cannot tell whether anything happened at all - it looks
// identical to the tap being ignored.
test("assistant widget closes when a product's View link is clicked", async ({ page }) => {
  await page.route("**/api/v1/cart/*/token", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { token: "test-cart-token" }, meta: { requestId: "req_cart_token" } })
    });
  });

  await page.route("http://localhost:8090/v1/assistant/messages/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: assistant.completed",
        `data: ${JSON.stringify({
          request_id: "req_test",
          thread_id: "00000000-0000-4000-8000-000000000010",
          message: "Aqui tienes una opcion.",
          intent: "SEARCH_PRODUCTS",
          products: [
            {
              product_id: "dummyjson_9006",
              variant_id: "everyday-runner-sneakers-standard",
              name: "Everyday Runner Sneakers",
              description: null,
              price: "119",
              currency: "USD",
              image_url: null,
              product_url: "/products/detail?slug=everyday-runner-sneakers",
              available: true,
              color: null,
              size: null,
              rating: null
            }
          ],
          cart: null,
          suggested_replies: []
        })}`,
        "",
        ""
      ].join("\n")
    });
  });

  await page.goto("/");
  const assistant = await openAssistant(page);
  await assistant.getByPlaceholder(/buscar|search/i).fill("tenis");
  await assistant.getByRole("button", { name: /enviar|send/i }).click();

  const viewLink = assistant.getByRole("link", { name: /^(ver|view)$/i });
  await expect(viewLink).toBeVisible();
  await viewLink.click();

  await page.waitForURL(/\/products\/everyday-runner-sneakers\/?$/);
  await expect(page.getByRole("dialog", { name: /assistant|asistente/i })).toHaveCount(0);
});

test("assistant widget closes when the cart summary's Open cart link is clicked", async ({ page }) => {
  await page.route("**/api/v1/cart/*/token", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { token: "test-cart-token" }, meta: { requestId: "req_cart_token" } })
    });
  });

  await page.route("http://localhost:8090/v1/assistant/messages/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: assistant.completed",
        `data: ${JSON.stringify({
          request_id: "req_test",
          thread_id: "00000000-0000-4000-8000-000000000011",
          message: "Este es tu carrito.",
          intent: "VIEW_CART",
          products: [],
          cart: {
            item_count: 1,
            subtotal: "119",
            currency: "USD",
            items: [{ slug: "everyday-runner-sneakers", quantity: 1 }]
          },
          action: { type: "OPEN_CART", status: "SUCCEEDED", entity_id: null, message: null },
          suggested_replies: []
        })}`,
        "",
        ""
      ].join("\n")
    });
  });

  await page.goto("/");
  const assistant = await openAssistant(page);
  await assistant.getByPlaceholder(/buscar|search/i).fill("ver carrito");
  await assistant.getByRole("button", { name: /enviar|send/i }).click();

  const openCartLink = assistant.getByRole("link", { name: /abrir carrito|open cart/i });
  await expect(openCartLink).toBeVisible();
  await openCartLink.click();

  await page.waitForURL(/\/cart\/?$/);
  await expect(page.getByRole("dialog", { name: /assistant|asistente/i })).toHaveCount(0);
});
