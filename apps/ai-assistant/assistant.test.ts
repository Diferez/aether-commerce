import { describe, expect, it } from "vitest";
import worker, { assistantGraphNodes, heuristicIntent } from "./worker";

type TestEnv = Parameters<typeof worker.fetch>[1];

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

// Stubs global fetch so calls to Gemini return a fixed classification while
// everything else (aether-api calls through the env.AETHER_API binding)
// behaves as usual - lets tests assert on how validateIntentResult reconciles
// a mocked LLM answer against the real heuristic.
function withMockedGemini<T>(intent: string, language: string, run: () => Promise<T>): Promise<T> {
  const geminiPayload = {
    candidates: [
      {
        content: {
          parts: [
            { text: JSON.stringify({ intent, confidence: 0.9, language, explanation: "mocked" }) }
          ]
        }
      }
    ]
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
  it("contains the full controlled graph", () => {
    expect(assistantGraphNodes).toEqual([
      "validate_request",
      "load_conversation_context",
      "classify_intent",
      "persist_user_message",
      "authorize_and_route",
      "handle_unsupported",
      "read_orders",
      "read_cart",
      "mutate_cart",
      "read_favorites",
      "mutate_favorites",
      "query_catalog",
      "persist_response"
    ]);
  });

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
    ["Agrega al carrito unos tenis rojos", "ADD_TO_CART", "es"]
  ] as const)("classifies %s", (message, intent, language) => {
    expect(heuristicIntent(message)).toMatchObject({ intent, language });
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

  it("does not let a context-confused LLM answer override a confident heuristic match", async () => {
    // Regression for a production bug: right after an orders question,
    // Gemini kept classifying the next, unrelated message as still about
    // orders (likely anchored on the redacted history it was given), which
    // trapped the shopper in a "sign in to see your orders" loop when they
    // actually asked to search deals.
    const apiFetch = () =>
      Promise.resolve(
        Response.json({
          success: true,
          data: [
            {
              id: "deal-1",
              slug: "deal-1",
              name: "Deal Product",
              finalPrice: 1000,
              availableStock: 4,
              images: []
            }
          ]
        })
      );
    const payload = await withMockedGemini("GET_MY_ORDERS", "es", async () => {
      const response = await worker.fetch(assistantRequest("Buscar ofertas"), {
        ...env(apiFetch),
        GEMINI_API_KEY: "test-key"
      });
      return response.json<{ intent: string }>();
    });
    expect(payload.intent).toBe("SEARCH_PRODUCTS");
  });

  it("keeps the session locale when the message has no language signal, even if Gemini guesses wrong", async () => {
    // Regression for the original interview bug: gibberish sent from a
    // Spanish session came back in English. Gemini still returns a "valid"
    // language for content-free input - it's just an ungrounded guess - so
    // the session's declared locale should win instead of Gemini's guess.
    const payload = await withMockedGemini("UNSUPPORTED", "en", async () => {
      const response = await worker.fetch(assistantRequest("asdlkjaslkdj"), {
        ...env(),
        GEMINI_API_KEY: "test-key"
      });
      return response.json<{ intent: string; message: string }>();
    });
    expect(payload.intent).toBe("UNSUPPORTED");
    expect(payload.message).toMatch(/no puedo ayudar/i);
  });

  it("trusts the heuristic's language read over Gemini's for a message with a clear signal", async () => {
    // Regression found while building the evaluation suite: Gemini
    // misdetected French/Italian orders messages as es/en despite the
    // message containing unambiguous keywords the heuristic already
    // recognizes (e.g. "commandes"). The heuristic's language now always
    // wins, not just for signal-free input.
    const payload = await withMockedGemini("GET_MY_ORDERS", "es", async () => {
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
    });
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
