"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Loader2, RotateCcw, Send, ShoppingBag, X } from "lucide-react";
import { formatMoney } from "@aether/core";
import { addProductReferenceToCart, getCartId, getCartToken, readLocalCart, replaceLocalCartItems } from "./cart-client";
import type { Cart, CartItem } from "@aether/schemas";
import { aiAssistantUrl, storefrontPath } from "./config";
import { useCustomerSession } from "./customer-client";
import { useLanguage } from "./LanguageProvider";

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
  cart?: {
    item_count: number;
    subtotal: string;
    currency: "USD";
    items: Array<Record<string, unknown>>;
  } | null;
  action?: {
    type: string;
    status: string;
    entity_id: string | null;
    message: string | null;
  };
  suggested_replies: string[];
};

type AssistantCartSummary = NonNullable<AssistantResponse["cart"]>;
type AssistantStreamData = AssistantResponse | AssistantProduct[] | AssistantCartSummary | { message?: string; text?: string };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  products?: AssistantProduct[];
  cart?: AssistantResponse["cart"];
  action?: AssistantResponse["action"];
  suggestedReplies?: string[];
  streaming?: boolean;
};

const threadStorageKey = "aether.assistant.threadId.v1";

export function AssistantWidget() {
  const { locale } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [cartFeedback, setCartFeedback] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const enabled = Boolean(aiAssistantUrl);

  const copy = useMemo(
    () =>
      locale === "es"
        ? {
            title: "Asistente Aether",
            intro: "Preguntame por productos reales o pide ayuda con tu carrito.",
            greetingGuest: "Hola! Soy el Asistente Aether. Preguntame por productos reales o pide ayuda con tu carrito.",
            greetingCustomer: "Hola {name}! Preguntame por productos reales o pide ayuda con tu carrito.",
            suggestedStart: ["Ver carrito", "Buscar ofertas"],
            placeholder: "Buscar tenis, regalos, ofertas...",
            send: "Enviar",
            reset: "Reiniciar",
            view: "Ver",
            add: "Agregar",
            adding: "Agregando...",
            added: "Agregado al carrito.",
            addError: "No fue posible agregarlo. Intentalo de nuevo.",
            inStock: "Disponible",
            outOfStock: "Agotado",
            variant: "Variante",
            cart: "Carrito",
            items: "productos",
            openCart: "Abrir carrito",
            busy: "Buscando...",
            error: "No pude conectar con el asistente. La tienda sigue funcionando normalmente."
          }
        : {
            title: "Aether Assistant",
            intro: "Ask me for real products or cart help.",
            greetingGuest: "Hi! I'm the Aether Assistant. Ask me for real products or cart help.",
            greetingCustomer: "Hi {name}! Ask me for real products or cart help.",
            suggestedStart: ["View cart", "Search deals"],
            placeholder: "Search sneakers, gifts, deals...",
            send: "Send",
            reset: "Reset",
            view: "View",
            add: "Add",
            adding: "Adding...",
            added: "Added to cart.",
            addError: "Could not add it. Try again.",
            inStock: "In stock",
            outOfStock: "Out of stock",
            variant: "Variant",
            cart: "Cart",
            items: "items",
            openCart: "Open cart",
            busy: "Searching...",
            error: "I could not reach the assistant. The store still works normally."
          },
    [locale]
  );

  const { customer } = useCustomerSession();
  const [footerCart, setFooterCart] = useState<Cart | null>(null);

  // Lets other components (e.g. the Hero's "Talk to Aether AI" CTA) open the
  // widget without prop-drilling, matching the aether-cart-changed pattern.
  useEffect(() => {
    const openAssistant = () => setIsOpen(true);
    window.addEventListener("aether-open-assistant", openAssistant);
    return () => window.removeEventListener("aether-open-assistant", openAssistant);
  }, []);

  // Keeps a persistent cart total pinned in the footer (see PASO 3 bug #4) instead
  // of only recapping the cart inline whenever the assistant happens to mention it.
  useEffect(() => {
    const syncFooterCart = () => setFooterCart(readLocalCart());
    syncFooterCart();
    window.addEventListener("aether-cart-changed", syncFooterCart);
    window.addEventListener("storage", syncFooterCart);
    return () => {
      window.removeEventListener("aether-cart-changed", syncFooterCart);
      window.removeEventListener("storage", syncFooterCart);
    };
  }, []);

  const footerItemCount = footerCart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0;
  const footerTotal = footerCart?.totals.total ?? 0;

  // On mobile the panel takes over the full screen (see the sm:-prefixed overrides on the
  // dialog below), so the store page behind it must stop scrolling - otherwise the user can
  // drag the background content while the "modal" is open. Desktop keeps its own scroll: the
  // panel there is a small floating card, not a takeover, so locking body scroll would be
  // surprising for no visual benefit.
  useEffect(() => {
    if (!isOpen || !window.matchMedia("(max-width: 639px)").matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  function greetingMessage(): ChatMessage {
    const content = customer
      ? copy.greetingCustomer.replace("{name}", customer.name.split(" ")[0] || customer.name)
      : copy.greetingGuest;
    return { role: "assistant", content, suggestedReplies: copy.suggestedStart };
  }

  useEffect(() => {
    if (!enabled) return;
    const storedThreadId = window.sessionStorage.getItem(threadStorageKey);
    if (!storedThreadId) {
      setHistoryReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `${aiAssistantUrl.replace(/\/$/, "")}/v1/assistant/conversations/${encodeURIComponent(storedThreadId)}`,
          { headers: await assistantRequestHeaders() }
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          success?: boolean;
          data?: { messages?: Array<{ role: string; content: string | null; payload?: Record<string, unknown> }> };
        };
        if (cancelled || !payload.success || !payload.data?.messages?.length) return;
        const restored = payload.data.messages
          .map((entry): ChatMessage | null => {
            if (entry.role === "user") {
              return { role: "user", content: entry.content || "" };
            }
            if (entry.role === "assistant") {
              const stored = (entry.payload || {}) as Partial<AssistantResponse>;
              const restoredMessage: ChatMessage = {
                role: "assistant",
                content: entry.content || stored.message || ""
              };
              if (Array.isArray(stored.products)) restoredMessage.products = stored.products;
              if (stored.cart) restoredMessage.cart = stored.cart;
              if (stored.action) restoredMessage.action = stored.action;
              if (stored.suggested_replies) restoredMessage.suggestedReplies = stored.suggested_replies;
              return restoredMessage;
            }
            return null;
          })
          .filter((entry): entry is ChatMessage => entry !== null);
        if (!cancelled && restored.length > 0) {
          setThreadId(storedThreadId);
          setMessages(restored);
        }
      } catch {
        // Conversation history is a convenience restore, not required to use the assistant.
      } finally {
        if (!cancelled) setHistoryReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Runs once per mount to restore the prior conversation before the greeting can render.
  }, [enabled]);

  useEffect(() => {
    if (threadId) {
      window.sessionStorage.setItem(threadStorageKey, threadId);
    }
  }, [threadId]);

  useEffect(() => {
    if (!isOpen || !historyReady) return;
    setMessages((current) => (current.length === 0 ? [greetingMessage()] : current));
  }, [isOpen, historyReady]);

  useEffect(() => {
    if (isOpen) {
      panelRef.current?.querySelector("input")?.focus();
    } else {
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [isOpen, messages, statusMessage]);

  if (!enabled) {
    return null;
  }

  function assistantRequestBody(message: string) {
    const context = assistantClientContext();
    return JSON.stringify({
      thread_id: threadId,
      message,
      locale: locale === "es" ? "es-CO" : "en-US",
      currency: "USD",
      client_context: context
    });
  }

  function assistantClientContext() {
    const path = `${window.location.pathname}${window.location.search}`;
    const categoryMatch = window.location.pathname.match(/\/(?:store\/)?categories\/([^/?#]+)/);
    const params = new URLSearchParams(window.location.search);
    const categorySlug = categoryMatch?.[1] ? decodeURIComponent(categoryMatch[1]) : null;
    return {
      current_path: path,
      current_category: categorySlug,
      current_product_slug: params.get("slug")
    };
  }

  async function assistantRequestHeaders() {
    const cartToken = await getCartToken();
    return {
      "content-type": "application/json",
      "x-aether-cart-id": getCartId(),
      "x-aether-session-id": getCartId(),
      "x-aether-cart-token": cartToken
    };
  }

  async function sendMessage(message = input.trim()) {
    if (!message || isSending) return;
    setInput("");
    setIsSending(true);
    setStatusMessage(null);
    setMessages((current) => [...current, { role: "user", content: message }]);

    try {
      await sendMessageStream(message);
    } catch {
      try {
        await sendMessageFallback(message);
      } catch (err) {
        const text = err instanceof Error && err.message ? err.message : copy.error;
        setMessages((current) => [...current, { role: "assistant", content: text }]);
      }
    } finally {
      setIsSending(false);
      setStatusMessage(null);
    }
  }

  // Rate limits and budget caps return a normal JSON body with a specific,
  // already-translated message (e.g. "too many messages this minute") - that
  // is a very different situation from the assistant being unreachable, so
  // it should never be replaced with the generic connection-error copy.
  async function readErrorMessage(response: Response): Promise<string> {
    try {
      const payload = (await response.clone().json()) as { error?: { message?: string } };
      return typeof payload.error?.message === "string" && payload.error.message ? payload.error.message : copy.error;
    } catch {
      return copy.error;
    }
  }

  async function sendMessageFallback(message: string) {
    const response = await fetch(`${aiAssistantUrl.replace(/\/$/, "")}/v1/assistant/messages`, {
      method: "POST",
      headers: await assistantRequestHeaders(),
      body: assistantRequestBody(message)
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    const payload = (await response.json()) as AssistantResponse;
    appendAssistantResponse(payload);
  }

  async function sendMessageStream(message: string) {
    const response = await fetch(`${aiAssistantUrl.replace(/\/$/, "")}/v1/assistant/messages/stream`, {
      method: "POST",
      headers: await assistantRequestHeaders(),
      body: assistantRequestBody(message)
    });
    if (!response.ok || !response.body) throw new Error(await readErrorMessage(response));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;

    while (!completed) {
      const { value, done } = await reader.read();
      completed = done;
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";
      for (const chunk of chunks) {
        handleAssistantEvent(chunk);
      }
    }

    if (buffer.trim()) {
      handleAssistantEvent(buffer);
    }
  }

  function handleAssistantEvent(rawEvent: string) {
    const eventName = rawEvent
      .split("\n")
      .find((line) => line.startsWith("event:"))
      ?.replace("event:", "")
      .trim();
    const dataLine = rawEvent
      .split("\n")
      .find((line) => line.startsWith("data:"))
      ?.replace("data:", "")
      .trim();
    if (!eventName || !dataLine) return;
    let data: AssistantStreamData;
    try {
      data = JSON.parse(dataLine) as AssistantStreamData;
    } catch {
      setStatusMessage(null);
      setMessages((current) => [...current, { role: "assistant", content: copy.error }]);
      return;
    }

    if (eventName === "assistant.status" && "message" in data && data.message) {
      setStatusMessage(data.message || copy.busy);
    }
    if (eventName === "assistant.token" && !Array.isArray(data) && "text" in data && data.text) {
      setStatusMessage(null);
      upsertAssistantDraft({ content: data.text });
    }
    if (eventName === "assistant.products" && Array.isArray(data)) {
      setStatusMessage(copy.busy);
      upsertAssistantDraft({ products: data });
    }
    if (eventName === "assistant.cart_updated" && isAssistantCartSummary(data)) {
      setStatusMessage(locale === "es" ? "Carrito actualizado" : "Cart updated");
      upsertAssistantDraft({
        cart: data,
        action: {
          type: "OPEN_CART",
          status: "SUCCEEDED",
          entity_id: null,
          message: null
        }
      });
    }
    if (eventName === "assistant.clarification" && "message" in data && data.message) {
      setStatusMessage(null);
      upsertAssistantDraft({
        content: data.message,
        action: {
          type: "ASK_CLARIFICATION",
          status: "PENDING",
          entity_id: null,
          message: data.message
        }
      });
    }
    if (eventName === "assistant.completed" && !Array.isArray(data) && "thread_id" in data) {
      appendAssistantResponse(data);
    }
    if (eventName === "assistant.error") {
      setMessages((current) => [...current, { role: "assistant", content: "message" in data && data.message ? data.message : copy.error }]);
    }
  }

  function isAssistantCartSummary(data: AssistantStreamData): data is AssistantCartSummary {
    return (
      !Array.isArray(data) &&
      typeof data === "object" &&
      data !== null &&
      "item_count" in data &&
      typeof data.item_count === "number" &&
      "subtotal" in data &&
      typeof data.subtotal === "string" &&
      "currency" in data &&
      data.currency === "USD" &&
      "items" in data &&
      Array.isArray(data.items)
    );
  }

  function appendAssistantResponse(payload: AssistantResponse) {
    setThreadId(payload.thread_id);
    if (payload.cart && Array.isArray(payload.cart.items)) {
      replaceLocalCartItems(payload.cart.items as unknown as CartItem[]);
    }
    setMessages((current) => {
      const nextMessage: ChatMessage = {
        role: "assistant",
        content: payload.message,
        products: payload.products,
        cart: payload.cart,
        action: payload.action,
        suggestedReplies: payload.suggested_replies
      };
      if (current[current.length - 1]?.role === "assistant" && current[current.length - 1]?.streaming) {
        return [...current.slice(0, -1), nextMessage];
      }
      return [...current, nextMessage];
    });
  }

  function upsertAssistantDraft(partial: Partial<ChatMessage>) {
    setMessages((current) => {
      const existing =
        current[current.length - 1]?.role === "assistant" && current[current.length - 1]?.streaming
          ? current[current.length - 1]
          : undefined;
      const draft: ChatMessage = {
        role: "assistant",
        content: partial.content ?? existing?.content ?? statusMessage ?? copy.busy,
        streaming: true
      };
      const nextProducts = partial.products ?? existing?.products;
      const nextCart = partial.cart ?? existing?.cart;
      const nextAction = partial.action ?? existing?.action;
      const nextSuggestedReplies = partial.suggestedReplies ?? existing?.suggestedReplies;

      if (nextProducts) draft.products = nextProducts;
      if (nextCart) draft.cart = nextCart;
      if (nextAction) draft.action = nextAction;
      if (nextSuggestedReplies) draft.suggestedReplies = nextSuggestedReplies;

      if (current[current.length - 1]?.role === "assistant" && current[current.length - 1]?.streaming) {
        return [...current.slice(0, -1), draft];
      }
      return [...current, draft];
    });
  }

  function reset() {
    setThreadId(null);
    window.sessionStorage.removeItem(threadStorageKey);
    setMessages([greetingMessage()]);
    setInput("");
    setCartFeedback(null);
  }

  function slugFromAssistantProduct(product: AssistantProduct) {
    try {
      const parsed = new URL(product.product_url, window.location.origin);
      const querySlug = parsed.searchParams.get("slug");
      if (querySlug) return querySlug;
      const segments = parsed.pathname.split("/").filter(Boolean);
      return segments[segments.length - 1] || product.product_id;
    } catch {
      return product.product_id;
    }
  }

  async function addAssistantProduct(product: AssistantProduct) {
    if (addingProductId) return;
    setAddingProductId(product.product_id);
    setCartFeedback(null);
    const slug = slugFromAssistantProduct(product);
    try {
      await addProductReferenceToCart({ slug, variantId: product.variant_id });
      setCartFeedback(copy.added);
    } catch {
      setCartFeedback(copy.addError);
    } finally {
      setAddingProductId(null);
    }
  }

  return (
    <>
      {isOpen ? (
        <div
          ref={panelRef}
          className="fixed inset-0 z-[9999] flex h-[100dvh] w-full flex-col overflow-hidden bg-chat-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:inset-auto sm:bottom-5 sm:left-5 sm:z-50 sm:h-[min(640px,calc(100vh-6rem))] sm:w-[calc(100vw-2rem)] sm:max-w-md sm:rounded-chat sm:border sm:border-chat-border sm:pb-0 sm:pt-0 sm:shadow-2xl"
          role="dialog"
          aria-label={copy.title}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-chat-border bg-chat-surface px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-chat-accent-soft text-sm font-bold text-chat-accent">
                <Bot size={16} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-chat-text">{copy.title}</p>
                <p className="truncate text-xs text-chat-text-muted">{copy.intro}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={reset} className="focus-ring grid h-9 w-9 place-items-center rounded-chat text-chat-text-muted hover:bg-chat-surface-alt hover:text-chat-text" aria-label={copy.reset}>
                <RotateCcw size={16} aria-hidden />
              </button>
              <button type="button" onClick={() => setIsOpen(false)} className="focus-ring grid h-9 w-9 place-items-center rounded-chat text-chat-text-muted hover:bg-chat-surface-alt hover:text-chat-text" aria-label="Close">
                <X size={18} aria-hidden />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-chat-bg p-3">
            {cartFeedback ? (
              <div className="rounded-chat border border-chat-success bg-chat-success-soft px-3 py-2 text-sm font-semibold text-chat-success" role="status" aria-live="polite">
                {cartFeedback}
              </div>
            ) : null}
            {messages.length === 0 ? (
              <div className="rounded-chat border border-dashed border-chat-border bg-chat-surface p-4 text-sm text-chat-text-muted">{copy.intro}</div>
            ) : null}
            {messages.map((message, index) => (
              <div key={index} className={message.role === "user" ? "ml-8 text-right" : "mr-8"}>
                <div
                  className={`inline-block max-w-[85%] rounded-2xl px-3.5 py-2.5 text-left text-sm leading-6 ${
                    message.role === "user"
                      ? "rounded-tr-md bg-chat-accent text-white"
                      : "rounded-tl-md bg-chat-surface text-chat-text"
                  }`}
                >
                  {message.content}
                </div>
                {message.products?.length ? (
                  <div className="mt-2 grid gap-2 text-left">
                    {message.products.map((product) => (
                      <div key={product.product_id} className="flex gap-3 rounded-2xl border border-chat-border bg-chat-surface p-3">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="h-16 w-16 shrink-0 rounded-xl bg-chat-surface-alt object-cover" />
                        ) : (
                          <div className="h-16 w-16 shrink-0 rounded-xl bg-chat-surface-alt" />
                        )}
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-chat-text">{product.name}</p>
                          <p className="text-[15px] font-bold text-chat-success">
                            {formatMoney(Math.round(Number(product.price) * 100), "USD", locale === "es" ? "es-CO" : "en-US")}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            <span
                              className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                product.available ? "bg-chat-success-soft text-chat-success" : "bg-chat-surface-alt text-chat-text-muted"
                              }`}
                            >
                              {product.available ? <Check size={11} strokeWidth={3} aria-hidden /> : null}
                              {product.available ? copy.inStock : copy.outOfStock}
                            </span>
                            {product.color || product.size ? (
                              <span className="rounded-full bg-chat-surface-alt px-2 py-0.5 text-[11px] font-medium text-chat-text-muted">
                                {copy.variant}: {[product.color, product.size].filter(Boolean).join(" / ")}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex gap-2">
                            <a
                              href={storefrontPath(product.product_url)}
                              onClick={() => setIsOpen(false)}
                              className="focus-ring rounded-chat border border-chat-border px-3 py-1.5 text-[13px] font-medium text-chat-text transition-colors active:scale-[0.97]"
                            >
                              {copy.view}
                            </a>
                            <button
                              type="button"
                              onClick={() => void addAssistantProduct(product)}
                              disabled={!product.available || addingProductId === product.product_id}
                              className="focus-ring rounded-chat bg-chat-accent px-3 py-1.5 text-[13px] font-semibold text-white transition-colors active:scale-[0.97] disabled:cursor-wait disabled:bg-chat-border disabled:text-chat-text-muted"
                            >
                              {addingProductId === product.product_id ? copy.adding : copy.add}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {message.cart ? (
                  <div className="mt-2 rounded-2xl border border-chat-border bg-chat-surface p-3 text-left">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-chat-success">{copy.cart}</p>
                        <p className="text-sm font-semibold text-chat-text">
                          {message.cart.item_count} {copy.items}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-chat-text">
                        {formatMoney(Math.round(Number(message.cart.subtotal) * 100), "USD", locale === "es" ? "es-CO" : "en-US")}
                      </p>
                    </div>
                    {message.cart.items.length > 0 ? (
                      <ul className="mt-2 divide-y divide-chat-border border-t border-chat-border">
                        {message.cart.items.map((item, index) => {
                          const name = typeof item.name === "string" ? item.name : "";
                          const imageUrl = typeof item.imageUrl === "string" ? item.imageUrl : null;
                          const quantity = Number(item.quantity ?? 1);
                          const lineTotal = Number(item.lineTotal ?? 0);
                          return (
                            <li key={index} className="flex items-center gap-2 py-1.5 text-xs text-chat-text-muted">
                              {imageUrl ? (
                                <img src={imageUrl} alt={name} className="h-9 w-9 shrink-0 rounded-lg bg-chat-surface-alt object-cover" />
                              ) : (
                                <div className="h-9 w-9 shrink-0 rounded-lg bg-chat-surface-alt" />
                              )}
                              <span className="min-w-0 flex-1 truncate">
                                {quantity > 1 ? `${quantity}x ` : ""}
                                {name}
                              </span>
                              <span className="shrink-0 font-medium text-chat-text">
                                {formatMoney(Math.round(lineTotal), "USD", locale === "es" ? "es-CO" : "en-US")}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {message.action?.type === "OPEN_CART" || message.action?.type?.startsWith("CART_") ? (
                      <a
                        href={storefrontPath("/cart")}
                        onClick={() => setIsOpen(false)}
                        className="focus-ring mt-3 inline-flex rounded-chat bg-chat-accent px-3 py-2 text-xs font-semibold text-white"
                      >
                        {copy.openCart}
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {message.suggestedReplies?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.suggestedReplies.slice(0, 3).map((reply) => (
                      <button
                        key={reply}
                        type="button"
                        onClick={() => void sendMessage(reply)}
                        className="focus-ring rounded-full border border-chat-border px-3.5 py-2 text-[13px] font-medium text-chat-text-muted hover:border-chat-accent hover:text-chat-text"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {isSending ? (
              <div className="mr-8 inline-flex items-center gap-2 rounded-2xl bg-chat-surface px-3.5 py-2.5 text-sm text-chat-text-muted">
                <Loader2 size={15} className="animate-spin" aria-hidden />
                {statusMessage || copy.busy}
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-chat-border bg-chat-surface">
            <div className="flex items-center justify-between gap-3 border-b border-chat-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <ShoppingBag size={16} className="text-chat-success" aria-hidden />
                <span className="text-xs font-medium text-chat-text-muted">
                  {footerItemCount} {copy.items}
                </span>
              </div>
              <span className="text-sm font-bold text-chat-text">{formatMoney(footerTotal, "USD", locale === "es" ? "es-CO" : "en-US")}</span>
            </div>
            <form
              className="flex items-center gap-2 px-3 py-3"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage();
              }}
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="focus-ring min-h-11 min-w-0 flex-1 rounded-2xl border border-chat-border bg-chat-surface-alt px-4 text-sm text-chat-text outline-none placeholder:text-chat-text-muted"
                placeholder={copy.placeholder}
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-full bg-chat-accent text-white disabled:bg-chat-border disabled:text-chat-text-muted"
                aria-label={copy.send}
              >
                <Send size={17} aria-hidden />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(true)}
          className="focus-ring fixed left-5 z-50 flex h-14 w-14 items-center justify-center gap-3 rounded-full bg-chat-accent text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition hover:-translate-y-0.5 sm:w-auto sm:justify-start sm:px-4"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
          aria-expanded={isOpen}
          aria-label={copy.title}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-white">
            <Bot size={19} aria-hidden />
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-xs text-white/70">Aether</span>
            <span className="block text-sm font-semibold">{copy.title}</span>
          </span>
        </button>
      )}
    </>
  );
}
