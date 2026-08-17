import {
  createGeminiRestProvider,
  AgentCartToolExecutor,
  createEmptyResultPrompt,
  createAgentExecutionPlan,
  createIntentClassificationPrompt,
  createSearchExtractionPrompt,
  authorizeAgentToolIntent,
  executeAgentModelText,
  normalizeAgentIntentResult,
  parseAgentModelJson,
  redactSensitiveText,
  type AgentIntentResult
} from "@aether/agent-core";
import type { AgentAuditEvent } from "@aether/observability";
import { createD1ConversationMemory } from "./adapters/conversation-memory";
import { createD1AgentToolTelemetry } from "./adapters/tool-telemetry";

type Fetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type Env = {
  AETHER_API_BASE_URL: string;
  // Service binding to the aether-api Worker. Cloudflare blocks a Worker on a
  // *.workers.dev subdomain from fetching another Worker's *.workers.dev URL
  // over plain HTTPS (error 1042), so calls must go through this binding
  // instead of a raw fetch() to AETHER_API_BASE_URL.
  AETHER_API?: Fetcher;
  DB?: D1Database;
  AI_ASSISTANT_ENABLED?: string;
  AI_CORS_ALLOWED_ORIGINS?: string;
  AI_MAX_INPUT_CHARACTERS?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_TEMPERATURE?: string;
  GEMINI_MAX_OUTPUT_TOKENS?: string;
  AI_INTENT_CONFIDENCE_THRESHOLD?: string;
  AI_MUTATION_CONFIDENCE_THRESHOLD?: string;
  AI_MUTATIONS_ENABLED?: string;
  AI_OPERATIONS_TOKEN?: string;
  AI_RATE_LIMIT_MESSAGES_PER_MINUTE?: string;
  AI_RATE_LIMIT_MESSAGES_PER_HOUR?: string;
  AI_RATE_LIMIT_ANONYMOUS_PER_DAY?: string;
  AI_RATE_LIMIT_AUTHENTICATED_PER_DAY?: string;
  AI_DAILY_REQUEST_BUDGET?: string;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
};

type AssistantProduct = {
  product_id: string;
  variant_id: string | null;
  name: string;
  description: string | null;
  price: string;
  currency: "USD";
  image_url: string | null;
  product_url: string;
  available: boolean;
  color?: string | null;
  size?: string | null;
  rating: number | null;
};

type AssistantResponse = {
  request_id: string;
  thread_id: string;
  message: string;
  intent: string;
  products: AssistantProduct[];
  cart: Record<string, unknown> | null;
  action: { type: string; status: string; entity_id: string | null; message: string | null };
  suggested_replies: string[];
};

type AssistantRequest = {
  thread_id?: string | null;
  message?: string;
  locale?: string;
  currency?: "USD";
  client_context?: {
    current_product_id?: string | null;
    current_product_slug?: string | null;
    current_category?: string | null;
    current_path?: string | null;
  };
};

type IntentResult = AgentIntentResult;

const encoder = new TextEncoder();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return json(request, env, { status: "ok", service: "aether-ai", runtime: "cloudflare-worker", time: new Date().toISOString() });
    }
    if (url.pathname === "/readyz") {
      return json(request, env, {
        status: env.AI_ASSISTANT_ENABLED === "false" ? "disabled" : "ready",
        checks: {
          aetherApi: Boolean(env.AETHER_API_BASE_URL),
          gemini: Boolean(env.GEMINI_API_KEY),
        },
      });
    }
    if (url.pathname === "/metrics") {
      return new Response(await renderMetrics(env), {
        headers: { ...corsHeaders(request, env), "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (request.method === "POST" && url.pathname === "/v1/assistant/messages") {
      const limit = await enforceMessageUsage(request, env);
      if (limit) return json(request, env, limit.payload, limit.status);
      return json(request, env, await handleAssistant(request, env));
    }
    if (request.method === "POST" && url.pathname === "/v1/assistant/messages/stream") {
      const limit = await enforceMessageUsage(request, env);
      if (limit) return json(request, env, limit.payload, limit.status);
      return streamAssistant(request, env);
    }
    const conversationMatch = url.pathname.match(/^\/v1\/assistant\/conversations\/([^/]+)$/);
    if (conversationMatch && request.method === "GET") {
      const result = await getConversation(request, env, decodeURIComponent(conversationMatch[1]));
      return json(request, env, result.payload, result.status);
    }
    if (conversationMatch && request.method === "DELETE") {
      const result = await deleteConversation(request, env, decodeURIComponent(conversationMatch[1]));
      return json(request, env, result.payload, result.status);
    }
    if (request.method === "GET" && url.pathname === "/v1/internal/audit/events") {
      const result = await getAuditEvents(request, env, url);
      return json(request, env, result.payload, result.status);
    }

    return json(request, env, { error: "not_found" }, 404);
  },
};

async function handleAssistant(request: Request, env: Env): Promise<AssistantResponse> {
  const body = (await request.json().catch(() => ({}))) as AssistantRequest;
  const requestId = crypto.randomUUID();
  const threadId = body.thread_id || crypto.randomUUID();
  const locale = body.locale || "es-CO";
  const message = String(body.message || "").slice(0, inputCharacterLimit(env));
  const cartId = request.headers.get("x-aether-cart-id") || "";
  const cartToken = request.headers.get("x-aether-cart-token") || "";
  const sessionHash = await stableHash(request.headers.get("x-aether-session-id") || cartId || "anonymous");

  if (env.AI_ASSISTANT_ENABLED === "false") {
    return responsePayload(requestId, threadId, locale.toLowerCase().startsWith("es") ? "El asistente esta desactivado temporalmente." : "The assistant is temporarily disabled.", "UNSUPPORTED");
  }

  const intentResult = await classifyIntent(message, env, sessionHash, locale);
  const intent = intentResult.intent;
  const executionPlan = createAgentExecutionPlan(intent);
  const cartTools = createCartToolExecutor(env);
  // Reply in whatever language this specific message was written in, not
  // whatever the storefront's UI locale happens to be set to.
  const spanish = intentResult.language === "es";

  await persistConversationMessage(env, threadId, sessionHash, locale, "user", redactSensitiveText(message), {
    request_id: requestId,
    intent_result: intentResult,
    client_context: body.client_context || {},
  });
  const finish = async (payload: AssistantResponse): Promise<AssistantResponse> => {
    await persistConversationMessage(env, threadId, sessionHash, locale, "assistant", payload.message, payload);
    return payload;
  };
  const audit = async (
    toolName: string,
    normalizedArguments: string,
    targetEntityId: string | null,
    authorizationResult: "allowed" | "denied",
    executionStatus: "succeeded" | "failed" | "blocked",
    errorCode: string | null = null
  ): Promise<string> => {
    const key = await idempotencyKey(requestId, toolName, normalizedArguments);
    await persistAuditEvent(env, {
      request_id: requestId,
      thread_id: threadId,
      user_or_session_hash: sessionHash,
      tool_name: toolName,
      normalized_arguments: normalizedArguments,
      target_entity_id: targetEntityId,
      idempotency_key: key,
      authorization_result: authorizationResult,
      execution_status: executionStatus,
      error_code: errorCode,
    });
    return key;
  };

  if (intentResult.confidence < intentConfidenceThreshold(env)) {
    return finish(responsePayload(
      requestId,
      threadId,
      spanish ? "Necesito una instruccion mas clara para ayudarte sin asumir datos." : "I need a clearer request so I can help without guessing.",
      "UNSUPPORTED",
      [],
      null,
      "ASK_CLARIFICATION",
      "PENDING"
    ));
  }

  const toolAuthorization = authorizeAgentToolIntent({
    intent,
    confidence: intentResult.confidence,
    mutationConfidenceThreshold: mutationConfidenceThreshold(env)
  });
  if (!toolAuthorization.allowed) {
    await audit(intent.toLowerCase(), `intent_confidence:${intentResult.confidence.toFixed(2)}`, null, "denied", "blocked", toolAuthorization.reason);
    return finish(responsePayload(
      requestId,
      threadId,
      spanish ? "Antes de cambiar tu carrito necesito una instruccion mas especifica." : "Before changing your cart I need a more specific instruction.",
      intent,
      [],
      null,
      "ASK_CLARIFICATION",
      "PENDING"
    ));
  }

  if (executionPlan === "unsupported") {
    return finish(responsePayload(
      requestId,
      threadId,
      spanish ? "No puedo ayudar con esa solicitud, pero si puedo buscar productos reales o revisar tu carrito." : "I cannot help with that request, but I can search real products or review your cart.",
      intent
    ));
  }

  if (executionPlan === "cart_read") {
    const cart = cartId && cartToken ? await fetchCart(env, cartId, cartToken) : null;
    if (!cart) {
      return finish(responsePayload(
        requestId,
        threadId,
        spanish ? "Necesito validar tu carrito antes de consultarlo. Vuelve a abrir la tienda e intenta de nuevo." : "I need to validate your cart before reading it. Reopen the store and try again.",
        intent,
        [],
        null,
        "ASK_CLARIFICATION",
        "PENDING"
      ));
    }
    const reply =
      intent === "CHECKOUT_REQUEST"
        ? spanish
          ? "Puedo preparar tu carrito, pero el pago se completa en el checkout seguro de Aether."
          : "I can prepare your cart, but payment must be completed through Aether secure checkout."
        : spanish
          ? `Tu carrito tiene ${Number(cart.item_count || 0)} producto(s).`
          : `Your cart has ${Number(cart.item_count || 0)} item(s).`;
    return finish(responsePayload(requestId, threadId, reply, intent, [], cart, intent === "CHECKOUT_REQUEST" ? "OPEN_CHECKOUT" : "OPEN_CART", "SUCCEEDED"));
  }

  if (executionPlan === "cart_mutation" && intent !== "ADD_TO_CART") {
    if (env.AI_MUTATIONS_ENABLED === "false") {
      await audit(intent.toLowerCase(), "mutations_disabled", null, "denied", "blocked", "mutations_disabled");
      return finish(responsePayload(requestId, threadId, spanish ? "Los cambios del carrito estan desactivados temporalmente." : "Cart changes are temporarily disabled.", intent, [], null, "ASK_CLARIFICATION", "PENDING"));
    }
    if (!cartId || !cartToken) {
      await audit(intent.toLowerCase(), "cart_token_missing", null, "denied", "blocked", "cart_token_missing");
      return finish(responsePayload(requestId, threadId, spanish ? "Necesito validar tu carrito antes de actualizarlo." : "I need to validate your cart before updating it.", intent, [], null, "ASK_CLARIFICATION", "PENDING"));
    }
    const cart = await fetchCart(env, cartId, cartToken);
    if (!cart) {
      await audit(intent.toLowerCase(), `cart:${cartId}`, cartId, "denied", "blocked", "cart_unavailable");
      return finish(responsePayload(requestId, threadId, spanish ? "No pude consultar tu carrito. No realice ningun cambio." : "I could not read your cart. No changes were made.", intent, [], null, "ASK_CLARIFICATION", "FAILED"));
    }
    if (intent === "CLEAR_CART") {
      const idem = await idempotencyKey(requestId, "clear_cart", `cart:${cartId}`);
      const updated = await cartTools.clear({
        cartId,
        cartToken,
        idempotencyKey: idem,
        cart,
        items: Array.isArray(cart.items) ? cart.items as Record<string, unknown>[] : [],
        getItemId: (item) => String(item.slug || item.variantId || item.productId || "")
      });
      await audit("clear_cart", `cart:${cartId}`, cartId, "allowed", updated ? "succeeded" : "failed", updated ? null : "cart_update_failed");
      return finish(responsePayload(requestId, threadId, spanish ? "Listo. Vacie el carrito." : "Done. I cleared the cart.", intent, [], updated || cart, updated ? "CART_CLEARED" : "ASK_CLARIFICATION", updated ? "SUCCEEDED" : "FAILED"));
    }
    const item = resolveCartItem(cart, message);
    if (!item) {
      await audit(intent.toLowerCase(), `cart:${cartId}:item_ambiguous`, cartId, "denied", "blocked", "item_ambiguous");
      return finish(responsePayload(requestId, threadId, spanish ? "Necesito saber exactamente que producto del carrito quieres cambiar." : "I need to know exactly which cart item you want to change.", intent, [], cart, "ASK_CLARIFICATION", "PENDING"));
    }
    const itemId = String(item.slug || item.variantId || item.productId || "");
    if (intent === "REMOVE_FROM_CART") {
      const normalizedArguments = `cart:${cartId}:item:${itemId}`;
      const idem = await idempotencyKey(requestId, "remove_from_cart", normalizedArguments);
      const updated = await cartTools.remove({ cartId, cartToken, idempotencyKey: idem, itemId });
      await audit("remove_from_cart", normalizedArguments, itemId, "allowed", updated ? "succeeded" : "failed", updated ? null : "cart_update_failed");
      return finish(responsePayload(requestId, threadId, spanish ? "Listo. Quite el producto del carrito." : "Done. I removed the item from your cart.", intent, [], updated || cart, updated ? "CART_ITEM_REMOVED" : "ASK_CLARIFICATION", updated ? "SUCCEEDED" : "FAILED"));
    }
    const quantity = extractQuantity(message);
    if (!quantity) {
      await audit("update_cart_item", `cart:${cartId}:item:${itemId}:quantity_missing`, itemId, "denied", "blocked", "quantity_missing");
      return finish(responsePayload(requestId, threadId, spanish ? "Indica una cantidad entre 1 y 25 para actualizar el carrito." : "Tell me a quantity from 1 to 25 to update the cart.", intent, [], cart, "ASK_CLARIFICATION", "PENDING"));
    }
    const normalizedArguments = `cart:${cartId}:item:${itemId}:quantity:${quantity}`;
    const idem = await idempotencyKey(requestId, "update_cart_item", normalizedArguments);
    const updated = await cartTools.update({ cartId, cartToken, idempotencyKey: idem, itemId, quantity });
    await audit("update_cart_item", normalizedArguments, itemId, "allowed", updated ? "succeeded" : "failed", updated ? null : "cart_update_failed");
    return finish(responsePayload(requestId, threadId, spanish ? `Listo. Actualice la cantidad a ${quantity}.` : `Done. I updated the quantity to ${quantity}.`, intent, [], updated || cart, updated ? "CART_ITEM_UPDATED" : "ASK_CLARIFICATION", updated ? "SUCCEEDED" : "FAILED"));
  }

  const contextProduct = await currentContextProduct(env, body);
  const products = contextProduct ? [contextProduct] : await searchProducts(env, message, sessionHash);
  if (executionPlan === "cart_mutation" && intent === "ADD_TO_CART") {
    if (env.AI_MUTATIONS_ENABLED === "false") {
      await audit("add_to_cart", "mutations_disabled", null, "denied", "blocked", "mutations_disabled");
      return finish(responsePayload(requestId, threadId, spanish ? "Los cambios del carrito estan desactivados temporalmente." : "Cart changes are temporarily disabled.", intent, products, null, "ASK_CLARIFICATION", "PENDING"));
    }
    if (!cartId || !cartToken) {
      await audit("add_to_cart", "cart_token_missing", null, "denied", "blocked", "cart_token_missing");
      return finish(responsePayload(requestId, threadId, spanish ? "Necesito validar tu carrito antes de actualizarlo." : "I need to validate your cart before updating it.", intent, products, null, "ASK_CLARIFICATION", "PENDING"));
    }
    if (products.length !== 1) {
      await audit("add_to_cart", `cart:${cartId}:product_ambiguous:${products.length}`, cartId, "denied", "blocked", "product_ambiguous");
      return finish(responsePayload(requestId, threadId, spanish ? "Encontre varias opciones. Dime cual quieres agregar antes de modificar el carrito." : "I found multiple options. Tell me which one to add before I change the cart.", intent, products, null, "ASK_CLARIFICATION", "PENDING"));
    }
    const product = products[0];
    if (product) {
      const quantity = extractQuantity(message) || 1;
      const normalizedArguments = `cart:${cartId}:product:${product.product_id}:variant:${product.variant_id || ""}:quantity:${quantity}`;
      const idem = await idempotencyKey(requestId, "add_to_cart", normalizedArguments);
      const cart = await cartTools.add({ cartId, cartToken, idempotencyKey: idem, product, quantity });
      await audit("add_to_cart", normalizedArguments, product.product_id, "allowed", cart ? "succeeded" : "failed", cart ? null : "cart_update_failed");
      if (cart) {
        return finish(responsePayload(requestId, threadId, spanish ? "Listo. Agregue el producto al carrito." : "Done. I added the product to your cart.", intent, [product], cart, "CART_ITEM_ADDED", "SUCCEEDED"));
      }
    }
  }

  if (products.length > 0) {
    return finish(responsePayload(requestId, threadId, spanish ? "Encontre estas opciones reales en Aether." : "I found these real options in Aether.", intent, products));
  }
  const emptyResultMessage = await composeEmptyResultReply(env, message, spanish, sessionHash);
  return finish(responsePayload(requestId, threadId, emptyResultMessage, intent));
}

type AssistantHttpResult = {
  status: number;
  payload: Record<string, unknown>;
};

async function getConversation(request: Request, env: Env, threadId: string): Promise<AssistantHttpResult> {
  if (!env.DB) return { status: 503, payload: { success: false, error: "persistence_unavailable" } };
  const sessionHash = await stableHash(request.headers.get("x-aether-session-id") || request.headers.get("x-aether-cart-id") || "anonymous");
  const result = await createD1ConversationMemory(env.DB).read(threadId, sessionHash);
  if (result.status === "not_found") return { status: 404, payload: { success: false, error: "conversation_not_found" } };
  if (result.status === "forbidden") return { status: 403, payload: { success: false, error: "forbidden" } };
  return {
    status: 200,
    payload: {
      success: true,
      data: {
        thread_id: result.conversation.id,
        locale: result.conversation.locale,
        created_at: result.conversation.createdAt,
        updated_at: result.conversation.updatedAt,
        messages: result.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          payload: message.payload,
          created_at: message.createdAt,
        })),
      },
    },
  };
}

async function deleteConversation(request: Request, env: Env, threadId: string): Promise<AssistantHttpResult> {
  if (!env.DB) return { status: 503, payload: { success: false, error: "persistence_unavailable" } };
  const sessionHash = await stableHash(request.headers.get("x-aether-session-id") || request.headers.get("x-aether-cart-id") || "anonymous");
  const result = await createD1ConversationMemory(env.DB).delete(threadId, sessionHash);
  if (result.status === "not_found") return { status: 404, payload: { success: false, error: "conversation_not_found" } };
  if (result.status === "forbidden") return { status: 403, payload: { success: false, error: "forbidden" } };
  return { status: 200, payload: { success: true, data: { thread_id: threadId, deleted: true } } };
}

async function getAuditEvents(request: Request, env: Env, url: URL): Promise<AssistantHttpResult> {
  if (!env.AI_OPERATIONS_TOKEN) return { status: 404, payload: { success: false, error: "not_found" } };
  if (request.headers.get("x-aether-operations-token") !== env.AI_OPERATIONS_TOKEN) {
    return { status: 403, payload: { success: false, error: "forbidden" } };
  }
  if (!env.DB) return { status: 503, payload: { success: false, error: "persistence_unavailable" } };
  const threadId = url.searchParams.get("thread_id");
  const requestId = url.searchParams.get("request_id");
  if (!threadId && !requestId) {
    return { status: 400, payload: { success: false, error: "thread_id_or_request_id_required" } };
  }
  const query = threadId
    ? "select event_id, request_id, thread_id, user_or_session_hash, tool_name, normalized_arguments, target_entity_id, idempotency_key, authorization_result, execution_status, error_code, created_at from ai_action_audit where thread_id = ? order by created_at desc limit 50"
    : "select event_id, request_id, thread_id, user_or_session_hash, tool_name, normalized_arguments, target_entity_id, idempotency_key, authorization_result, execution_status, error_code, created_at from ai_action_audit where request_id = ? order by created_at desc limit 50";
  const rows = await env.DB.prepare(query).bind(threadId || requestId).all<Record<string, unknown>>();
  return { status: 200, payload: { success: true, data: rows.results || [] } };
}

async function enforceMessageUsage(request: Request, env: Env): Promise<AssistantHttpResult | null> {
  if (env.AI_ASSISTANT_ENABLED === "false") return null;
  const body = (await request.clone().json().catch(() => ({}))) as AssistantRequest;
  // These checks run before intent classification (which is what actually
  // detects the message's language), so locale is the only signal available
  // here - good enough for a handful of rate-limit/budget messages.
  const spanish = (body.locale || "es-CO").toLowerCase().startsWith("es");
  const maxInputCharacters = inputCharacterLimit(env);
  if (String(body.message || "").length > maxInputCharacters) {
    return {
      status: 413,
      payload: {
        success: false,
        error: {
          code: "input_too_large",
          message: spanish
            ? `El mensaje supera el limite de ${maxInputCharacters} caracteres.`
            : `The message exceeds the ${maxInputCharacters} character limit.`,
        },
      },
    };
  }
  if (!env.DB) return null;
  const sessionHash = await stableHash(request.headers.get("x-aether-session-id") || request.headers.get("x-aether-cart-id") || "anonymous");
  const scopeHashes = await rateLimitScopes(request, sessionHash, body.thread_id || null);
  const minuteLimit = numberEnv(env.AI_RATE_LIMIT_MESSAGES_PER_MINUTE);
  const hourLimit = numberEnv(env.AI_RATE_LIMIT_MESSAGES_PER_HOUR);
  const shortLimit = await enforceShortWindowLimits(env, scopeHashes, minuteLimit, hourLimit, spanish);
  if (shortLimit) {
    await incrementDailyUsage(env, usageDay(), "rate_limit_errors", { request_count: 1 });
    return shortLimit;
  }
  const day = usageDay();
  const hasAuthenticatedActor = Boolean(request.headers.get("authorization"));
  const sessionLimit = numberEnv(hasAuthenticatedActor ? env.AI_RATE_LIMIT_AUTHENTICATED_PER_DAY : env.AI_RATE_LIMIT_ANONYMOUS_PER_DAY);
  const projectLimit = numberEnv(env.AI_DAILY_REQUEST_BUDGET);
  const sessionUsage = await getDailyUsage(env, day, sessionHash);
  if (sessionLimit !== null && sessionUsage >= sessionLimit) {
    await incrementDailyUsage(env, day, "rate_limit_errors", { request_count: 1 });
    return {
      status: 429,
      payload: {
        success: false,
        error: {
          code: "daily_session_limit_exceeded",
          message: spanish
            ? "El asistente alcanzo el limite diario de esta sesion."
            : "The assistant reached this session's daily limit.",
        },
      },
    };
  }
  const projectUsage = await getDailyUsage(env, day, "project");
  if (projectLimit !== null && projectUsage >= projectLimit) {
    await incrementDailyUsage(env, day, "rate_limit_errors", { request_count: 1 });
    return {
      status: 429,
      payload: {
        success: false,
        error: {
          code: "daily_budget_exceeded",
          message: spanish
            ? "El asistente alcanzo el presupuesto diario configurado."
            : "The assistant reached its configured daily budget.",
        },
      },
    };
  }
  await incrementDailyUsage(env, day, sessionHash, { request_count: 1 });
  await incrementDailyUsage(env, day, "project", { request_count: 1 });
  return null;
}

async function rateLimitScopes(request: Request, sessionHash: string, threadId: string | null): Promise<string[]> {
  const rawScopes = ["project", `session:${sessionHash}`];
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) rawScopes.push(`ip:${ip}`);
  const authorization = request.headers.get("authorization");
  if (authorization) rawScopes.push(`user:${authorization}`);
  if (threadId) rawScopes.push(`conversation:${threadId}`);
  return Promise.all(rawScopes.map(stableHash));
}

async function enforceShortWindowLimits(
  env: Env,
  scopeHashes: string[],
  minuteLimit: number | null,
  hourLimit: number | null,
  spanish: boolean
): Promise<AssistantHttpResult | null> {
  const now = new Date();
  const windows = [
    {
      limit: minuteLimit,
      key: `minute:${now.toISOString().slice(0, 16)}`,
      expiresAt: new Date(now.getTime() + 2 * 60 * 1000).toISOString(),
      code: "minute_rate_limit_exceeded",
      message: spanish
        ? "El asistente alcanzo el limite de mensajes por minuto. Intenta de nuevo en un momento."
        : "The assistant reached its per-minute message limit. Try again in a moment.",
    },
    {
      limit: hourLimit,
      key: `hour:${now.toISOString().slice(0, 13)}`,
      expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      code: "hour_rate_limit_exceeded",
      message: spanish
        ? "El asistente alcanzo el limite de mensajes por hora. Intenta de nuevo mas tarde."
        : "The assistant reached its per-hour message limit. Try again later.",
    },
  ];
  for (const window of windows) {
    if (window.limit === null) continue;
    for (const scopeHash of scopeHashes) {
      const allowed = await checkRateBucket(env, scopeHash, window.key, window.limit);
      if (!allowed) {
        return { status: 429, payload: { success: false, error: { code: window.code, message: window.message } } };
      }
    }
    for (const scopeHash of scopeHashes) {
      await incrementRateBucket(env, scopeHash, window.key, window.expiresAt);
    }
  }
  await pruneExpiredRateBuckets(env);
  return null;
}

async function checkRateBucket(
  env: Env,
  scopeHash: string,
  windowKey: string,
  limit: number
): Promise<boolean> {
  if (!env.DB) return true;
  const current = await env.DB
    .prepare("select request_count from ai_rate_limit_buckets where scope_hash = ? and window_key = ?")
    .bind(scopeHash, windowKey)
    .first<{ request_count: number }>();
  return Number(current?.request_count || 0) < limit;
}

async function incrementRateBucket(env: Env, scopeHash: string, windowKey: string, expiresAt: string): Promise<void> {
  if (!env.DB) return;
  await env.DB
    .prepare(
      `insert into ai_rate_limit_buckets (id, scope_hash, window_key, request_count, expires_at, created_at, updated_at)
       values (?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       on conflict(scope_hash, window_key) do update set
         request_count = request_count + 1,
         expires_at = excluded.expires_at,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(crypto.randomUUID(), scopeHash, windowKey, expiresAt)
    .run();
}

async function pruneExpiredRateBuckets(env: Env): Promise<void> {
  if (!env.DB) return;
  try {
    await env.DB.prepare("delete from ai_rate_limit_buckets where expires_at <= datetime('now')").run();
  } catch {
    // Metrics remain safe if a prior deployment has not applied the migration yet.
  }
}

async function renderMetrics(env: Env): Promise<string> {
  if (!env.DB) return "aether_ai_worker_ready 1\nai_requests_total 0\n";
  const day = usageDay();
  const usage = await env.DB
    .prepare(
      "select user_or_session_hash, request_count, llm_call_count, tool_call_count from ai_usage_daily where usage_date = ?"
    )
    .bind(day)
    .all<{ user_or_session_hash: string; request_count: number; llm_call_count: number; tool_call_count: number }>();
  const audit = await env.DB
    .prepare(
      "select authorization_result, execution_status, count(*) as count from ai_action_audit group by authorization_result, execution_status"
    )
    .all<{ authorization_result: string; execution_status: string; count: number }>();
  const projectRequests = Number((usage.results || []).find((row) => row.user_or_session_hash === "project")?.request_count || 0);
  const projectLlmCalls = Number((usage.results || []).find((row) => row.user_or_session_hash === "project")?.llm_call_count || 0);
  const projectToolCalls = Number((usage.results || []).find((row) => row.user_or_session_hash === "project")?.tool_call_count || 0);
  const rateErrors = Number((usage.results || []).find((row) => row.user_or_session_hash === "rate_limit_errors")?.request_count || 0);
  const cartMutations = (audit.results || [])
    .filter((row) => row.authorization_result === "allowed" && row.execution_status === "succeeded")
    .reduce((total, row) => total + Number(row.count || 0), 0);
  const cartMutationFailures = (audit.results || [])
    .filter((row) => row.authorization_result === "allowed" && row.execution_status === "failed")
    .reduce((total, row) => total + Number(row.count || 0), 0);
  const blockedMutations = (audit.results || [])
    .filter((row) => row.execution_status === "blocked")
    .reduce((total, row) => total + Number(row.count || 0), 0);
  const activeBuckets = await getActiveRateLimitBuckets(env);
  const dailyBudget = numberEnv(env.AI_DAILY_REQUEST_BUDGET);
  const budgetRatio = dailyBudget && dailyBudget > 0 ? Math.min(1, projectRequests / dailyBudget) : 0;
  return [
    "aether_ai_worker_ready 1",
    `ai_requests_total ${projectRequests}`,
    "ai_requests_active 0",
    "ai_request_duration_seconds 0",
    `ai_llm_calls_total ${projectLlmCalls}`,
    "ai_llm_duration_seconds 0",
    "ai_llm_tokens_input_total 0",
    "ai_llm_tokens_output_total 0",
    `ai_tool_calls_total ${projectToolCalls}`,
    "ai_tool_errors_total 0",
    `ai_rate_limit_errors_total ${rateErrors}`,
    `ai_rate_limit_buckets_active ${activeBuckets}`,
    `ai_cart_mutations_total ${cartMutations}`,
    `ai_cart_mutation_failures_total ${cartMutationFailures}`,
    "ai_clarifications_total 0",
    "ai_fallback_total 0",
    `ai_blocked_cart_mutations_total ${blockedMutations}`,
    `ai_daily_budget_usage_ratio ${budgetRatio}`,
    `ai_daily_budget_requests_remaining ${dailyBudget === null ? 0 : Math.max(0, dailyBudget - projectRequests)}`,
    `ai_daily_budget_threshold_70_reached ${budgetRatio >= 0.7 ? 1 : 0}`,
    `ai_daily_budget_threshold_85_reached ${budgetRatio >= 0.85 ? 1 : 0}`,
    `ai_daily_budget_threshold_95_reached ${budgetRatio >= 0.95 ? 1 : 0}`,
    "",
  ].join("\n");
}

async function getActiveRateLimitBuckets(env: Env): Promise<number> {
  if (!env.DB) return 0;
  try {
    const row = await env.DB
      .prepare("select count(*) as count from ai_rate_limit_buckets where expires_at > datetime('now')")
      .first<{ count: number }>();
    return Number(row?.count || 0);
  } catch {
    return 0;
  }
}

async function getDailyUsage(env: Env, day: string, userOrSessionHash: string): Promise<number> {
  if (!env.DB) return 0;
  const row = await env.DB
    .prepare("select request_count from ai_usage_daily where usage_date = ? and user_or_session_hash = ?")
    .bind(day, userOrSessionHash)
    .first<{ request_count: number }>();
  return Number(row?.request_count || 0);
}

async function incrementDailyUsage(
  env: Env,
  day: string,
  userOrSessionHash: string,
  increments: { request_count?: number; llm_call_count?: number; tool_call_count?: number } = {}
): Promise<void> {
  if (!env.DB) return;
  const requestCount = increments.request_count || 0;
  const llmCallCount = increments.llm_call_count || 0;
  const toolCallCount = increments.tool_call_count || 0;
  await env.DB
    .prepare(
      `insert into ai_usage_daily (
         id, usage_date, user_or_session_hash, request_count, llm_call_count, tool_call_count, input_tokens, output_tokens, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       on conflict(usage_date, user_or_session_hash) do update set
         request_count = request_count + excluded.request_count,
         llm_call_count = llm_call_count + excluded.llm_call_count,
         tool_call_count = tool_call_count + excluded.tool_call_count,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(crypto.randomUUID(), day, userOrSessionHash, requestCount, llmCallCount, toolCallCount)
    .run();
}

async function persistConversationMessage(
  env: Env,
  threadId: string,
  sessionHash: string,
  locale: string,
  role: "user" | "assistant",
  content: string,
  payload: Record<string, unknown> | AssistantResponse
): Promise<void> {
  if (!env.DB) return;
  await createD1ConversationMemory(env.DB).persist({ threadId, sessionHash, locale, role, content, payload });
}

async function persistAuditEvent(
  env: Env,
  event: AgentAuditEvent
): Promise<void> {
  if (!env.DB) return;
  await createD1AgentToolTelemetry(env.DB, (scope) => incrementDailyUsage(env, usageDay(), scope, { tool_call_count: 1 })).record(event);
}

async function stableHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function idempotencyKey(requestId: string, toolName: string, normalizedArguments: string): Promise<string> {
  return `ai_${await stableHash(`${requestId}:${toolName}:${normalizedArguments}`)}`;
}

async function streamAssistant(request: Request, env: Env): Promise<Response> {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(sse("assistant.status", { message: "Buscando..." }));
        const payload = await handleAssistant(request, env);
        if (payload.products.length) controller.enqueue(sse("assistant.products", payload.products));
        if (payload.cart) controller.enqueue(sse("assistant.cart_updated", payload.cart));
        controller.enqueue(sse("assistant.completed", payload));
      } catch {
        controller.enqueue(sse("assistant.error", { message: "El asistente esta temporalmente ocupado." }));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      ...corsHeaders(request, env),
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}

async function classifyIntent(message: string, env: Env, sessionHash?: string, localeFallback = "es-CO"): Promise<IntentResult> {
  const fallback = heuristicIntent(message, localeFallback);
  const provider = geminiTextProvider(env, 2500);
  if (!provider) return fallback;
  const text = await executeAgentModelText({
    provider,
    request: {
      systemPrompt: createIntentClassificationPrompt("Aether"),
      message,
      temperature: Number(env.GEMINI_TEMPERATURE || 0.1),
      maxOutputTokens: Number(env.GEMINI_MAX_OUTPUT_TOKENS || 600),
      responseMimeType: "application/json"
    },
    onAttempt: sessionHash
      ? async () => {
          await incrementDailyUsage(env, usageDay(), sessionHash, { llm_call_count: 1 });
          await incrementDailyUsage(env, usageDay(), "project", { llm_call_count: 1 });
        }
      : undefined
  });
  return validateIntentResult(parseAgentModelJson(text), fallback);
}

// The heuristic query extractor only strips a fixed list of verbs (busca,
// add, search, ...) so phrases it doesn't recognize - "tienen chanel?",
// "busco un laptop" - pass through with filler words and punctuation still
// attached, and the catalog's substring match then finds nothing even when
// the product exists. Gemini pulls out just the product/brand keyword
// instead, falling back to the heuristic if it's unavailable or fails.
async function extractSearchQuery(message: string, env: Env, sessionHash?: string): Promise<string> {
  const fallback = extractQueryHeuristic(message);
  const provider = geminiTextProvider(env, 2000);
  if (!provider) return fallback;
  const text = await executeAgentModelText({
    provider,
    request: {
      systemPrompt: createSearchExtractionPrompt(),
      message,
      temperature: 0,
      maxOutputTokens: 40,
      responseMimeType: "application/json"
    },
    onAttempt: sessionHash
      ? async () => {
          await incrementDailyUsage(env, usageDay(), sessionHash, { llm_call_count: 1 });
          await incrementDailyUsage(env, usageDay(), "project", { llm_call_count: 1 });
        }
      : undefined
  });
  const parsed = parseAgentModelJson(text);
  const query = typeof parsed.query === "string" ? parsed.query.trim().slice(0, 80) : "";
  return query || fallback;
}

// When a search/lookup genuinely finds nothing (e.g. the store just doesn't
// carry the requested category), Gemini composes a short, grounded reply
// naming what the store actually has instead of a generic "I can help you
// search" filler. Falls back to that filler if Gemini or the category list
// is unavailable, so behavior is unchanged without GEMINI_API_KEY.
async function composeEmptyResultReply(env: Env, message: string, spanish: boolean, sessionHash?: string): Promise<string> {
  const fallback = spanish
    ? "Puedo ayudarte a buscar productos reales y revisar tu carrito."
    : "I can help you search real products and review your cart.";
  const provider = geminiTextProvider(env, 2500);
  if (!provider) return fallback;
  try {
    const categories = await listCategoryNames(env);
    if (categories.length === 0) return fallback;
    const text = await executeAgentModelText({
      provider,
      request: {
        systemPrompt: createEmptyResultPrompt({ storeName: "Aether", language: spanish ? "Spanish" : "English", categories }),
        message,
        temperature: 0.3,
        maxOutputTokens: 150
      },
      onAttempt: sessionHash
        ? async () => {
            await incrementDailyUsage(env, usageDay(), sessionHash, { llm_call_count: 1 });
            await incrementDailyUsage(env, usageDay(), "project", { llm_call_count: 1 });
          }
        : undefined
    });
    return text || fallback;
  } catch {
    return fallback;
  }
}

async function listCategoryNames(env: Env): Promise<string[]> {
  try {
    const response = await apiFetch(env, new URL("/api/v1/catalog/categories", env.AETHER_API_BASE_URL), undefined, 3000);
    if (!response.ok) return [];
    const payload = (await response.json()) as { data?: Array<{ name?: string }> };
    return (payload.data || []).map((category) => category.name).filter((name): name is string => Boolean(name));
  } catch {
    return [];
  }
}

function usageDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function numberEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function inputCharacterLimit(env: Env): number {
  return numberEnv(env.AI_MAX_INPUT_CHARACTERS) || 4000;
}

function intentConfidenceThreshold(env: Env): number {
  return numberEnv(env.AI_INTENT_CONFIDENCE_THRESHOLD) || 0.75;
}

function mutationConfidenceThreshold(env: Env): number {
  return numberEnv(env.AI_MUTATION_CONFIDENCE_THRESHOLD) || 0.9;
}

function validateIntentResult(parsed: { intent?: string; confidence?: unknown; explanation?: unknown; language?: unknown }, fallback: IntentResult): IntentResult {
  return normalizeAgentIntentResult(parsed, fallback);
}

// Word-boundary keyword check for the handful of Spanish/English shopping
// terms that show up in real messages. Accented characters and ¿/¡ are a
// near-certain Spanish signal on their own; otherwise the language with more
// keyword hits wins. On a tie or an empty/ambiguous message, fall back to
// the site's locale rather than guessing.
function detectLanguageHeuristic(message: string, localeFallback: string): "es" | "en" {
  const fallback = localeFallback.toLowerCase().startsWith("es") ? "es" : "en";
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  if (/[¿¡ñÑáéíóúÁÉÍÓÚ]/.test(trimmed)) return "es";
  const value = trimmed.toLowerCase();
  const spanishHits = (value.match(/\b(hola|gracias|tienen|tienes|quiero|busco|necesito|cuanto|donde|que|comprar|vacia|vaciar|limpia|agrega|anade|elimina|quita|cambia|actualiza|precio|oferta|articulo|producto|carrito|por favor|si|ver|mostrar)\b/g) || []).length;
  const englishHits = (value.match(/\b(hello|hi|hey|thanks|do|does|want|need|how much|where|what|buy|clear|empty|add|remove|delete|change|update|price|deal|item|product|cart|please|yes|show|view)\b/g) || []).length;
  if (spanishHits === englishHits) return fallback;
  return englishHits > spanishHits ? "en" : "es";
}

function heuristicIntent(message: string, localeFallback = "es-CO"): IntentResult {
  const value = message.toLowerCase();
  const language = detectLanguageHeuristic(message, localeFallback);
  if (/(ignora|ignore).*(reglas|rules|instrucciones|instructions)|gemini.*key|api key|prompt interno|system prompt|otro usuario|another user|tarjeta\s*\d{4}|4111/.test(value)) {
    return { intent: "UNSUPPORTED", confidence: 0.98, explanation: "Unsafe or unsupported request.", language };
  }
  if (/(vacia|vaciar|limpia|clear|empty).*(carrito|cart)|elimina todo|quita todo/.test(value)) return { intent: "CLEAR_CART", confidence: 0.94, explanation: "Explicit clear-cart request.", language };
  if (/(quita|elimina|remueve|remove|delete).*(carrito|cart|producto|item|audifono|zapato|tenis|mouse|shirt|shoe)/.test(value)) return { intent: "REMOVE_FROM_CART", confidence: 0.93, explanation: "Explicit remove-cart-item request.", language };
  if (/(cambia|actualiza|update).*(cantidad|quantity)|cantidad.*\d+/.test(value)) return { intent: "UPDATE_CART_ITEM", confidence: 0.93, explanation: "Explicit cart quantity update request.", language };
  if (/(pagar|checkout|payment|pay|comprar ahora)/.test(value)) return { intent: "CHECKOUT_REQUEST", confidence: 0.92, explanation: "Checkout guidance request.", language };
  if (/(carrito|cart)/.test(value)) return { intent: "GET_CART", confidence: 0.9, explanation: "Cart read request.", language };
  if (/(agrega|anade|a.{0,6}ade|add|pon|mete)/.test(value)) return { intent: "ADD_TO_CART", confidence: 0.91, explanation: "Explicit add-to-cart request.", language };
  if (/(busca|buscar|show|find|recomienda|recommend|producto|product|oferta|deal|zapato|shoe|tenis|ropa|shirt)/.test(value)) return { intent: "SEARCH_PRODUCTS", confidence: 0.88, explanation: "Product search or recommendation request.", language };
  return { intent: "GENERAL_STORE_QUESTION", confidence: 0.82, explanation: "General store assistant request.", language };
}


async function currentContextProduct(env: Env, body: AssistantRequest): Promise<AssistantProduct | null> {
  const slug = body.client_context?.current_product_slug;
  if (!slug) return null;
  const response = await apiFetch(env, new URL(`/api/v1/catalog/products/${encodeURIComponent(slug)}`, env.AETHER_API_BASE_URL), undefined, 5000);
  if (!response.ok) return null;
  const payload = (await response.json()) as { data?: unknown };
  return toAssistantProduct(payload.data);
}

function isDealsQuery(message: string): boolean {
  return /(deal|oferta|descuento|discount)/i.test(message);
}

async function searchProducts(env: Env, message: string, sessionHash?: string): Promise<AssistantProduct[]> {
  const apiUrl = new URL("/api/v1/catalog/products", env.AETHER_API_BASE_URL);
  apiUrl.searchParams.set("page", "1");
  apiUrl.searchParams.set("pageSize", "5");
  apiUrl.searchParams.set("inStock", "true");
  if (isDealsQuery(message)) {
    // "Search deals"/"Buscar ofertas" describe a filter, not literal product
    // text - a q= search for those words would never match a real product.
    apiUrl.searchParams.set("hasDiscount", "true");
    apiUrl.searchParams.set("sort", "discount");
  } else {
    const categoryMatch = matchCategorySynonym(message);
    if (categoryMatch) {
      // Once a category synonym resolves the request (e.g. "cellphones" ->
      // the smartphones category), skip the q= text filter entirely rather
      // than ANDing it with whatever Gemini/the heuristic extracted. That
      // extracted text is usually the same synonym word, which never
      // appears verbatim in the catalog (see matchCategorySynonym) and
      // would zero out the results the category filter just found.
      apiUrl.searchParams.set("category", categoryMatch.slug);
    } else {
      const query = await extractSearchQuery(message, env, sessionHash);
      if (query) apiUrl.searchParams.set("q", query);
    }
  }
  const response = await apiFetch(env, apiUrl, undefined, 5000);
  if (!response.ok) return [];
  const payload = (await response.json()) as { data?: unknown[] };
  return (payload.data || []).map(toAssistantProduct).filter(Boolean).slice(0, 5) as AssistantProduct[];
}

async function fetchCart(env: Env, cartId: string, cartToken: string): Promise<Record<string, unknown> | null> {
  const response = await apiFetch(env, new URL(`/api/v1/cart/${encodeURIComponent(cartId)}`, env.AETHER_API_BASE_URL), {
    headers: { "x-aether-cart-token": cartToken },
  }, 5000);
  if (!response.ok) return null;
  const payload = (await response.json()) as { data?: { items?: unknown[]; totals?: { subtotal?: number; currency?: string } } };
  const cart = payload.data;
  if (!cart) return null;
  return {
    item_count: Array.isArray(cart.items) ? cart.items.reduce((count, item) => count + Number((item as { quantity?: number }).quantity || 0), 0) : 0,
    subtotal: String(Number(cart.totals?.subtotal || 0) / 100),
    currency: "USD",
    items: cart.items || [],
  };
}

async function addToCart(env: Env, cartId: string, cartToken: string, product: AssistantProduct, quantity: number, idempotencyKeyValue: string): Promise<Record<string, unknown> | null> {
  const slug = product.product_url.split("slug=")[1]?.split("&")[0] || product.product_id;
  const response = await apiFetch(env, new URL(`/api/v1/cart/${encodeURIComponent(cartId)}/items`, env.AETHER_API_BASE_URL), {
    method: "POST",
    headers: { "content-type": "application/json", "x-aether-cart-token": cartToken, "x-idempotency-key": idempotencyKeyValue },
    body: JSON.stringify({ productId: decodeURIComponent(slug), variantId: product.variant_id || undefined, quantity }),
  }, 5000);
  if (!response.ok) return null;
  return fetchCart(env, cartId, cartToken);
}

async function removeCartItem(env: Env, cartId: string, cartToken: string, itemId: string, idempotencyKeyValue: string): Promise<Record<string, unknown> | null> {
  const response = await apiFetch(env, new URL(`/api/v1/cart/${encodeURIComponent(cartId)}/items/${encodeURIComponent(itemId)}`, env.AETHER_API_BASE_URL), {
    method: "DELETE",
    headers: { "x-aether-cart-token": cartToken, "x-idempotency-key": idempotencyKeyValue },
  }, 5000);
  if (!response.ok) return null;
  return toCartSummary(await response.json());
}

async function updateCartItem(env: Env, cartId: string, cartToken: string, itemId: string, quantity: number, idempotencyKeyValue: string): Promise<Record<string, unknown> | null> {
  const response = await apiFetch(env, new URL(`/api/v1/cart/${encodeURIComponent(cartId)}/items/${encodeURIComponent(itemId)}`, env.AETHER_API_BASE_URL), {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-aether-cart-token": cartToken, "x-idempotency-key": idempotencyKeyValue },
    body: JSON.stringify({ quantity }),
  }, 5000);
  if (!response.ok) return null;
  return toCartSummary(await response.json());
}

function createCartToolExecutor(env: Env): AgentCartToolExecutor<Record<string, unknown>, AssistantProduct, Record<string, unknown>> {
  return new AgentCartToolExecutor({
    add: ({ cartId, cartToken, product, quantity, idempotencyKey }) => addToCart(env, cartId, cartToken, product, quantity, idempotencyKey),
    remove: ({ cartId, cartToken, itemId, idempotencyKey }) => removeCartItem(env, cartId, cartToken, itemId, idempotencyKey),
    update: ({ cartId, cartToken, itemId, quantity, idempotencyKey }) => updateCartItem(env, cartId, cartToken, itemId, quantity, idempotencyKey)
  });
}

function toCartSummary(payload: unknown): Record<string, unknown> | null {
  const data = (payload as { data?: { items?: unknown[]; totals?: { subtotal?: number; currency?: string } } }).data;
  if (!data) return null;
  return {
    item_count: Array.isArray(data.items) ? data.items.reduce((count, item) => count + Number((item as { quantity?: number }).quantity || 0), 0) : 0,
    subtotal: String(Number(data.totals?.subtotal || 0) / 100),
    currency: "USD",
    items: data.items || [],
  };
}

function resolveCartItem(cart: Record<string, unknown>, message: string): Record<string, unknown> | null {
  const items = Array.isArray(cart.items) ? (cart.items as Record<string, unknown>[]) : [];
  if (items.length === 0) return null;
  const value = message.toLowerCase();
  const named = items.filter((item) => {
    const haystack = `${String(item.name || "")} ${String(item.slug || "")}`.toLowerCase();
    return haystack.split(/[-\s]+/).some((part) => part.length > 2 && value.includes(part));
  });
  if (named.length === 1) return named[0];
  if (named.length > 1) return null;
  return items.length === 1 ? items[0] : null;
}

function extractQuantity(message: string): number | null {
  const numeric = message.match(/\b([1-9]|1\d|2[0-5])\b/);
  if (numeric) return Number(numeric[1]);
  const value = message.toLowerCase();
  const words: Record<string, number> = { uno: 1, una: 1, dos: 2, tres: 3, four: 4, cuatro: 4, five: 5, cinco: 5 };
  for (const [word, quantity] of Object.entries(words)) {
    if (value.includes(word)) return quantity;
  }
  return null;
}

function toAssistantProduct(input: unknown): AssistantProduct | null {
  const product = input as Record<string, any>;
  if (!product || !product.slug || !product.name) return null;
  return {
    product_id: String(product.id || product.slug),
    variant_id: product.variants?.[0]?.id ? String(product.variants[0].id) : null,
    name: String(product.name),
    description: String(product.shortDescription || product.description || ""),
    price: String(Number(product.finalPrice || product.price || 0) / 100),
    currency: "USD",
    image_url: product.images?.[0]?.url || product.thumbnail || null,
    product_url: `/products/detail?slug=${encodeURIComponent(String(product.slug))}`,
    available: Number(product.availableStock || 0) > 0,
    color: product.variants?.[0]?.attributes?.color || null,
    size: product.variants?.[0]?.attributes?.size || null,
    rating: typeof product.rating?.average === "number" ? product.rating.average : null,
  };
}

function extractQueryHeuristic(message: string): string {
  return message
    .replace(/agrega|anade|añade|add|busca|buscar|search|show|find|recomienda|recommend|producto|product|oferta|deal/gi, "")
    .trim()
    .slice(0, 80);
}

// Strips diacritics for accent-insensitive matching (e.g. "célular" folds to
// "celular"). Mirrors the catalog service's own foldText so synonym matching
// stays consistent with how the catalog's q= filter compares text.
function foldText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// The catalog's `q` filter is a plain substring match against each product's
// name/brand/description/tags (see aether-api's getCatalogProducts), and this
// store's catalog data is tagged in Spanish (e.g. smartphones are tagged
// "smartphone", never "cellphone" or "celular"). Shoppers routinely ask for a
// category using words that never appear in that text - "cellphones",
// "celulares", "phones" - so the substring search finds nothing even though
// the category is fully in stock. Map those category-level synonyms to the
// catalog's real category slug so the assistant can filter by category
// instead of guessing at text. Keys are folded (lowercased, accents
// stripped); multi-word keys are checked before single-word ones.
const CATEGORY_SYNONYMS: Record<string, string> = {
  "cell phones": "smartphones",
  "cell phone": "smartphones",
  "mobile phones": "smartphones",
  "mobile phone": "smartphones",
  "telefono celular": "smartphones",
  "telefonos celulares": "smartphones",
  cellphones: "smartphones",
  cellphone: "smartphones",
  celulares: "smartphones",
  celular: "smartphones",
  moviles: "smartphones",
  movil: "smartphones",
  telefonos: "smartphones",
  telefono: "smartphones",
  phones: "smartphones",
  phone: "smartphones",
  tablets: "tablets",
  tabletas: "tablets",
  tableta: "tablets",
  laptops: "laptops",
  computadoras: "laptops",
  computadora: "laptops",
  notebooks: "laptops",
  notebook: "laptops",
  accessories: "mobile-accessories",
  accessory: "mobile-accessories",
  accesorios: "mobile-accessories",
  accesorio: "mobile-accessories",
  headphones: "mobile-accessories",
  headphone: "mobile-accessories",
  // "watches"/"reloj" are deliberately not mapped: the catalog splits watches
  // into "mens-watches"/"womens-watches" with no unified slug, so guessing
  // one gender would silently hide the other's products from a generic
  // "watches" search.
  sunglasses: "sunglasses",
  gafas: "sunglasses",
  furniture: "furniture",
  muebles: "furniture",
  mueble: "furniture",
};

// Longest keys first so "cell phones" is tried before "phones" would
// otherwise shadow it via a looser match.
const CATEGORY_SYNONYM_KEYS = Object.keys(CATEGORY_SYNONYMS).sort((a, b) => b.length - a.length);

function matchCategorySynonym(message: string): { key: string; slug: string } | null {
  const folded = foldText(message);
  for (const key of CATEGORY_SYNONYM_KEYS) {
    if (new RegExp(`\\b${key.replace(/\s+/g, "\\s+")}\\b`).test(folded)) {
      return { key, slug: CATEGORY_SYNONYMS[key] };
    }
  }
  return null;
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 5000): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

function geminiTextProvider(env: Env, timeoutMs: number) {
  return createGeminiRestProvider({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    fetch: (input, init) => fetchWithTimeout(input, init, timeoutMs)
  });
}

// Routes aether-api calls through the AETHER_API service binding when it is
// configured, falling back to a direct fetch (e.g. local `wrangler dev`
// without the binding wired up). See the Env.AETHER_API comment for why the
// binding is required in production.
function apiFetch(env: Env, input: RequestInfo | URL, init?: RequestInit, timeoutMs = 5000): Promise<Response> {
  const requestInit = { ...init, signal: AbortSignal.timeout(timeoutMs) };
  // Calling fetch as a method off a plain wrapper object (e.g. `{ fetch }.fetch(...)`)
  // throws "Illegal invocation" because the global fetch loses its required `this`
  // binding, so the binding and no-binding cases are called directly rather than
  // through a shared `fetcher` variable.
  return env.AETHER_API ? env.AETHER_API.fetch(input, requestInit) : fetch(input, requestInit);
}

function responsePayload(
  requestId: string,
  threadId: string,
  message: string,
  intent: string,
  products: AssistantProduct[] = [],
  cart: Record<string, unknown> | null = null,
  actionType = products.length ? "PRODUCTS_LISTED" : "NONE",
  actionStatus = products.length ? "SUCCEEDED" : "NOT_REQUESTED"
): AssistantResponse {
  const spanish = /[áéíóúñ]|carrito|producto|encontre|listo/i.test(message);
  return {
    request_id: requestId,
    thread_id: threadId,
    message,
    intent,
    products,
    cart,
    action: { type: actionType, status: actionStatus, entity_id: null, message: null },
    suggested_replies: spanish ? ["Ver carrito", "Buscar ofertas"] : ["View cart", "Search deals"],
  };
}

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function json(request: Request, env: Env, payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(request, env), "content-type": "application/json; charset=utf-8" },
  });
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowed = (env.AI_CORS_ALLOWED_ORIGINS || "*").split(",").map((item) => item.trim());
  const allowOrigin = allowed.includes("*") || allowed.includes(origin) ? origin || "*" : allowed[0] || "*";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-aether-cart-id,x-aether-session-id,x-aether-cart-token,x-aether-operations-token",
    "vary": "Origin",
  };
}
