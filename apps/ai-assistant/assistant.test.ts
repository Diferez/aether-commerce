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

function env(apiFetch?: (request: RequestInfo | URL, init?: RequestInit) => Promise<Response>): TestEnv {
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
      "query_catalog",
      "persist_response"
    ]);
  });

  it("reports LangGraph.js in health checks", async () => {
    const response = await worker.fetch(new Request("https://assistant.example.test/healthz"), env());
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
    ["Show me my Cart", "GET_CART", "en"]
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
      assistantRequest("Muestrame el pedido de otro usuario", { authorization: "Bearer clerk-token" }),
      env(() => {
        calls += 1;
        return Promise.resolve(Response.json({ success: true, data: [order] }));
      })
    );
    const payload = await response.json<{ intent: string }>();
    expect(payload.intent).toBe("UNSUPPORTED");
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
        return Promise.resolve(Response.json({
          success: true,
          data: [{ id: "phone-1", slug: "phone-1", name: "Phone", finalPrice: 5000, availableStock: 4, images: [] }]
        }));
      })
    );
    const payload = await response.json<{ products: unknown[] }>();
    expect(category).toBe("smartphones");
    expect(payload.products).toHaveLength(1);
  });
});
