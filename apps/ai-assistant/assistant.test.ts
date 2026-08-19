import { beforeAll, describe, expect, it } from "vitest";
import worker, { heuristicIntent } from "./worker";

type TestEnv = Parameters<typeof worker.fetch>[1];

beforeAll(() => {
  if (typeof crypto.subtle.timingSafeEqual !== "function") {
    crypto.subtle.timingSafeEqual = (a: BufferSource, b: BufferSource) => {
      const left = a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      const right = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      if (left.length !== right.length) return false;
      let difference = 0;
      for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
      return difference === 0;
    };
  }
});

const order = {
  id: "ord_interview_5001",
  number: "AETH-5001",
  state: "shipped",
  items: [{ quantity: 2 }],
  totals: { total: 12999, currency: "USD" },
  createdAt: "2026-08-12T18:00:00.000Z"
};

function env(
  apiFetch?: (request: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): TestEnv {
  return {
    AETHER_API_BASE_URL: "https://aether-api.example.test",
    AI_ASSISTANT_ENABLED: "true",
    AI_CORS_ALLOWED_ORIGINS: "https://store.example.test",
    AI_MUTATIONS_ENABLED: "true",
    ...(apiFetch ? { AETHER_API: { fetch: apiFetch } } : {})
  };
}

function assistantRequest(message: string, headers: Record<string, string> = {}) {
  return new Request("https://assistant.example.test/v1/assistant/messages", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ message, locale: "es-CO", privacy_consent: true })
  });
}

// Stubs global fetch so a call to Gemini returns a fixed plain-text reply
// with no tool call, as if the model answered conversationally instead of
// invoking a tool - lets tests assert on finalizeAgentResponseNode's language
// guard (detectedLanguageSignal), which substitutes a templated clarification
// whenever the model's free-text reply disagrees with the session's actual
// language instead of trusting the model's own language.
function withMockedGeminiTextReply<T>(text: string, run: () => Promise<T>): Promise<T> {
  const geminiPayload = {
    candidates: [
      {
        content: { role: "model", parts: [{ text }] },
        finishReason: "STOP",
        index: 0
      }
    ],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 }
  };
  const originalFetch = global.fetch;
  global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("generativelanguage.googleapis.com"))
      return Promise.resolve(Response.json(geminiPayload));
    return originalFetch(input, init);
  }) as typeof fetch;
  return run().finally(() => {
    global.fetch = originalFetch;
  });
}

describe("LangGraph Worker orchestration", () => {
  it("reports LangGraph.js in health checks", async () => {
    const response = await worker.fetch(
      new Request("https://assistant.example.test/healthz"),
      env()
    );
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      orchestration: "langgraph-js",
      langgraph: "1.4.8"
    });
  });

  it("allows the browser Authorization header", async () => {
    const response = await worker.fetch(
      new Request("https://assistant.example.test/v1/assistant/messages", {
        method: "OPTIONS",
        headers: { origin: "https://store.example.test" }
      }),
      env()
    );
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
  });

  it("rejects assistant requests without explicit privacy consent", async () => {
    const response = await worker.fetch(
      new Request("https://assistant.example.test/v1/assistant/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Busca celulares", locale: "es-CO", privacy_consent: false })
      }),
      env()
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "CONSENT_REQUIRED" } });
  });

  it("keeps operational metrics private", async () => {
    const response = await worker.fetch(
      new Request("https://assistant.example.test/metrics"),
      { ...env(), AI_OPERATIONS_TOKEN: "operations-secret" }
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
});

describe("interview regressions", () => {
  it.each([
    ["Busca el pedido 5001", "GET_ORDER", "es"],
    ["Estado de mi Compra", "GET_ORDER_STATUS", "es"],
    ["Cherche mes commandes", "GET_MY_ORDERS", "fr"],
    ["Mostra i miei ordini", "GET_MY_ORDERS", "it"],
    ["Show me my Cart", "GET_CART", "en"],
    ["Muestrame mis favoritos", "GET_FAVORITES", "es"],
    ["Add this to my favorites", "ADD_FAVORITE", "en"],
    ["Quita esto de mis favoritos", "REMOVE_FAVORITE", "es"],
    ["Montre mes favoris", "GET_FAVORITES", "fr"],
    ["Mostrami i miei preferiti", "GET_FAVORITES", "it"],
    ["Recomiéndame algo para viajar", "RECOMMEND_PRODUCTS", "es"],
    ["What do you recommend?", "RECOMMEND_PRODUCTS", "en"],
    ["Agrega al carrito unos tenis rojos", "ADD_TO_CART", "es"],
    ["Cancela mi pedido", "CANCEL_ORDER", "es"],
    ["Cancel my order 5001", "CANCEL_ORDER", "en"],
    ["Quiero devolver mi pedido", "REQUEST_RETURN", "es"],
    ["I want to return my order", "REQUEST_RETURN", "en"],
    ["Quiero un reembolso", "REQUEST_REFUND", "es"],
    ["I want a refund", "REQUEST_REFUND", "en"],
    ["Tengo un cupon WELCOME10", "APPLY_COUPON", "es"],
    ["Add coupon WELCOME10 to my order", "APPLY_COUPON", "en"]
  ] as const)("classifies %s", (message, intent, language) => {
    expect(heuristicIntent(message)).toMatchObject({ intent, language });
  });

  it("applies a real coupon code to the cart", async () => {
    const response = await worker.fetch(
      assistantRequest("Aplica el cupon WELCOME10", { "x-aether-cart-id": "cart_1", "x-aether-cart-token": "tok_1" }),
      env((request) => {
        const url = new URL(request instanceof Request ? request.url : String(request));
        expect(url.pathname).toBe("/api/v1/cart/cart_1/coupon");
        return Promise.resolve(
          Response.json({ success: true, data: { items: [], totals: { subtotal: 5000, discount: 500, currency: "USD" } } })
        );
      })
    );
    const payload = await response.json<{ intent: string; action: { status: string } }>();
    expect(payload.intent).toBe("APPLY_COUPON");
    expect(payload.action.status).toBe("SUCCEEDED");
  });

  it("reports an invalid coupon code without pretending it applied", async () => {
    const response = await worker.fetch(
      assistantRequest("Aplica el cupon NOPE10", { "x-aether-cart-id": "cart_1", "x-aether-cart-token": "tok_1" }),
      env(() => Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 404 })))
    );
    const payload = await response.json<{ intent: string; action: { status: string }; message: string }>();
    expect(payload.intent).toBe("APPLY_COUPON");
    expect(payload.action.status).toBe("FAILED");
    expect(payload.message).toMatch(/no es un cupon valido/i);
  });

  it("cancels the shopper's own order through the real per-order route", async () => {
    let calledPath = "";
    const response = await worker.fetch(
      assistantRequest("Cancela mi pedido", { authorization: "Bearer clerk-token" }),
      env((request, init) => {
        const url = new URL(request instanceof Request ? request.url : String(request));
        if (url.pathname === "/api/v1/orders") {
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer clerk-token");
          return Promise.resolve(Response.json({ success: true, data: [{ ...order, state: "pending_payment" }] }));
        }
        calledPath = url.pathname;
        return Promise.resolve(Response.json({ success: true, data: { orderId: order.id, previousState: "pending_payment", state: "cancelled" } }, { status: 201 }));
      })
    );
    const payload = await response.json<{ intent: string; action: { status: string }; message: string }>();
    expect(calledPath).toBe(`/api/v1/orders/${order.id}/cancel`);
    expect(payload.intent).toBe("CANCEL_ORDER");
    expect(payload.action.status).toBe("SUCCEEDED");
    expect(payload.message).toMatch(/cancelled/);
  });

  it("does not cancel another shopper's order and never calls the mutation route without sign-in", async () => {
    let calls = 0;
    const response = await worker.fetch(
      assistantRequest("Cancela mi pedido"),
      env(() => {
        calls += 1;
        return Promise.resolve(Response.json({ success: true, data: [order] }));
      })
    );
    const payload = await response.json<{ intent: string; action: { type: string } }>();
    expect(payload.intent).toBe("CANCEL_ORDER");
    expect(payload.action.type).toBe("SIGN_IN_REQUIRED");
    expect(calls).toBe(0);
  });

  it("explains an illegal cancellation instead of claiming it happened", async () => {
    const response = await worker.fetch(
      assistantRequest("Cancela mi pedido", { authorization: "Bearer clerk-token" }),
      env((request) => {
        const url = new URL(request instanceof Request ? request.url : String(request));
        if (url.pathname === "/api/v1/orders") {
          return Promise.resolve(Response.json({ success: true, data: [{ ...order, state: "delivered" }] }));
        }
        return Promise.resolve(new Response(JSON.stringify({ success: false, error: { code: "ORDER_TRANSITION_INVALID" } }), { status: 409 }));
      })
    );
    const payload = await response.json<{ intent: string; action: { status: string }; message: string }>();
    expect(payload.action.status).toBe("FAILED");
    expect(payload.message).not.toMatch(/cancelled/i);
  });

  it("looks up only the authenticated shopper's order", async () => {
    const apiFetch = (_request: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer clerk-token");
      return Promise.resolve(Response.json({ success: true, data: [order] }));
    };
    const response = await worker.fetch(
      assistantRequest("Busca el pedido 5001", { authorization: "Bearer clerk-token" }),
      env(apiFetch)
    );
    const payload = await response.json<{ intent: string; orders: unknown[] }>();
    expect(payload).toMatchObject({ intent: "GET_ORDER" });
    expect(payload.orders).toEqual([
      expect.objectContaining({ number: "AETH-5001", state: "shipped", item_count: 2 })
    ]);
  });

  it("does not call the order API for cross-user access", async () => {
    let calls = 0;
    const response = await worker.fetch(
      assistantRequest("Muestrame el pedido de otro usuario", {
        authorization: "Bearer clerk-token"
      }),
      env(() => {
        calls += 1;
        return Promise.resolve(Response.json({ success: true, data: [order] }));
      })
    );
    const payload = await response.json<{ intent: string }>();
    expect(payload.intent).toBe("UNSUPPORTED");
    expect(calls).toBe(0);
  });

  it("keeps the session locale when the message has no language signal, even if the model replies in the wrong language", async () => {
    // Regression for the original interview bug: gibberish sent from a
    // Spanish session came back in English. The model can still answer
    // conversationally (no tool call) in the wrong language - the session's
    // declared locale must win instead, via finalizeAgentResponseNode's
    // detectedLanguageSignal guard.
    const payload = await withMockedGeminiTextReply(
      "Hello, I want to help you view your cart or order.",
      async () => {
        const response = await worker.fetch(assistantRequest("asdlkjaslkdj"), {
          ...env(),
          GEMINI_API_KEY: "test-key"
        });
        return response.json<{ message: string }>();
      }
    );
    expect(payload.message).toMatch(/instruccion mas clara/i);
  });

  it("trusts the session's language read over the model's reply for a message with a clear signal", async () => {
    // Regression found while building the evaluation suite: the model
    // sometimes answers in the wrong language even when the shopper's
    // message has an unambiguous signal (e.g. "commandes" is clearly
    // French). The session's own language read always wins.
    const payload = await withMockedGeminiTextReply(
      "Hello, I want to help you view your cart or order.",
      async () => {
        const response = await worker.fetch(
          new Request("https://assistant.example.test/v1/assistant/messages", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              message: "Cherche mes commandes",
              locale: "fr-FR",
              privacy_consent: true
            })
          }),
          { ...env(), GEMINI_API_KEY: "test-key" }
        );
        return response.json<{ suggested_replies: string[] }>();
      }
    );
    expect(payload.suggested_replies[0]).toBe("Voir le panier");
  });

  it("lists the authenticated shopper's favorites", async () => {
    const response = await worker.fetch(
      assistantRequest("Muestrame mis favoritos", { authorization: "Bearer clerk-token" }),
      env((request) => {
        const url = new URL(
          request instanceof Request ? request.url : request instanceof URL ? request.href : request
        );
        if (url.pathname === "/api/v1/favorites") {
          return Promise.resolve(Response.json({ success: true, data: ["prod-1"] }));
        }
        return Promise.resolve(
          Response.json({
            success: true,
            data: {
              id: "prod-1",
              slug: "prod-1",
              name: "Wireless Mouse",
              finalPrice: 2999,
              availableStock: 4,
              images: []
            }
          })
        );
      })
    );
    const payload = await response.json<{ intent: string; favorites: unknown[] }>();
    expect(payload.intent).toBe("GET_FAVORITES");
    expect(payload.favorites).toEqual([
      expect.objectContaining({ product_id: "prod-1", name: "Wireless Mouse" })
    ]);
  });

  it("requires sign-in to add a favorite", async () => {
    let calls = 0;
    const response = await worker.fetch(
      assistantRequest("Agrega esto a mis favoritos"),
      env(() => {
        calls += 1;
        return Promise.resolve(Response.json({ success: true }));
      })
    );
    const payload = await response.json<{ intent: string; action: { type: string } }>();
    expect(payload.intent).toBe("ADD_FAVORITE");
    expect(payload.action.type).toBe("SIGN_IN_REQUIRED");
    expect(calls).toBe(0);
  });

  it("does not invent products for an unavailable shoe category", async () => {
    const requests: URL[] = [];
    const response = await worker.fetch(
      assistantRequest("Busca zapatillas"),
      env((request) => {
        const url = new URL(
          request instanceof Request ? request.url : request instanceof URL ? request.href : request
        );
        requests.push(url);
        return Promise.resolve(Response.json({ success: true, data: [] }));
      })
    );
    const payload = await response.json<{ intent: string; products: unknown[]; message: string }>();
    expect(payload.intent).toBe("SEARCH_PRODUCTS");
    expect(payload.products).toHaveLength(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.searchParams.get("q")).toBe("zapatillas");
    expect(payload.message).not.toMatch(/no puedo ayudar con esa solicitud/i);
  });

  it("routes an unambiguous 'my orders' request straight to get_my_orders without ever calling the model", async () => {
    // Regression for a real production bug: clicking "Ver mis pedidos" right
    // after a "Buscar ofertas" turn returned that earlier turn's product
    // results again instead of the shopper's orders - the LLM tool-calling
    // path occasionally picks an unrelated tool for unambiguous, no-argument
    // read requests. GET_MY_ORDERS/GET_CART/GET_FAVORITES now bypass the
    // model entirely via heuristicIntent (validateAgentRequestNode's
    // tryHeuristicShortCircuit), so there's no tool-call decision for the
    // model to get wrong. Asserts on both ends: the right data comes back,
    // and Gemini's endpoint is never touched to get it.
    let geminiCalled = false;
    const originalFetch = global.fetch;
    global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("generativelanguage.googleapis.com")) geminiCalled = true;
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const response = await worker.fetch(
        assistantRequest("Ver mis pedidos", { authorization: "Bearer clerk-token" }),
        {
          ...env((_request, init) => {
            expect(new Headers(init?.headers).get("authorization")).toBe("Bearer clerk-token");
            return Promise.resolve(Response.json({ success: true, data: [order] }));
          }),
          GEMINI_API_KEY: "test-key"
        }
      );
      const payload = await response.json<{ intent: string; orders: unknown[]; message: string }>();
      expect(payload.intent).toBe("GET_MY_ORDERS");
      expect(payload.orders).toEqual([expect.objectContaining({ number: "AETH-5001" })]);
      expect(payload.message).toMatch(/pedido/i);
      expect(geminiCalled).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("still asks the model when GET_MY_ORDERS preconditions block the heuristic short-circuit", async () => {
    // The short-circuit still enforces the same sign-in requirement the LLM
    // tool-calling path would - it must never surface order data (or any
    // other tool's data) without authorization just because it skipped the
    // model.
    const response = await worker.fetch(
      assistantRequest("Ver mis pedidos"),
      { ...env(), GEMINI_API_KEY: "test-key" }
    );
    const payload = await response.json<{ intent: string; action: { type: string } }>();
    expect(payload.intent).toBe("GET_MY_ORDERS");
    expect(payload.action.type).toBe("SIGN_IN_REQUIRED");
  });

  it("maps celulares to the real smartphones category", async () => {
    let category = "";
    const response = await worker.fetch(
      assistantRequest("Busca celulares"),
      env((request) => {
        const url = new URL(
          request instanceof Request ? request.url : request instanceof URL ? request.href : request
        );
        category = url.searchParams.get("category") || "";
        return Promise.resolve(
          Response.json({
            success: true,
            data: [
              {
                id: "phone-1",
                slug: "phone-1",
                name: "Phone",
                finalPrice: 5000,
                availableStock: 4,
                images: []
              }
            ]
          })
        );
      })
    );
    const payload = await response.json<{ products: unknown[] }>();
    expect(category).toBe("smartphones");
    expect(payload.products).toHaveLength(1);
  });
});
