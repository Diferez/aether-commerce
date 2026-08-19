"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { apiBaseUrl } from "../config";
import { parseSseFrames } from "./parseSseFrames";
import { buildChatRequestContext } from "./useAdminChatContext";
import type { ChatArtifact, ChatMessage, ChatStatusPhase } from "./types";

const conversationStorageKey = "aether.admin.chat.conversationId.v1";

function readStoredConversationId(): string | null {
  try {
    return window.sessionStorage.getItem(conversationStorageKey);
  } catch {
    return null;
  }
}

function storeConversationId(id: string) {
  try {
    window.sessionStorage.setItem(conversationStorageKey, id);
  } catch {
    // Storage may be unavailable (private browsing) - the conversation just
    // won't survive a page reload, which is a graceful degradation.
  }
}

export function useAdminChatStream() {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatusPhase | "idle">("idle");
  const [sending, setSending] = useState(false);
  const [resolvedOperationIds, setResolvedOperationIds] = useState<Set<string>>(new Set());
  const conversationIdRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getToken().catch(() => null);
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  const hydrate = useCallback(async () => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const storedId = readStoredConversationId();
    if (!storedId) return;
    conversationIdRef.current = storedId;

    try {
      const headers = await authHeaders();
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/chat/conversations/${storedId}`, { headers });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        success: boolean;
        data?: { messages: Array<{ id: string; role: string; content: string | null; toolCall: { toolName: string; artifact: ChatArtifact } | null }> };
      };
      if (!payload.success || !payload.data) return;
      const restored: ChatMessage[] = payload.data.messages.flatMap((row): ChatMessage[] => {
        if (row.role === "user" && row.content) return [{ id: row.id, role: "user", content: row.content }];
        if (row.role === "assistant" && row.content) return [{ id: row.id, role: "assistant", content: row.content }];
        if (row.role === "tool" && row.toolCall) {
          return [{ id: row.id, role: "tool", toolName: row.toolCall.toolName, content: row.content ?? "", artifact: row.toolCall.artifact }];
        }
        return [];
      });
      setMessages(restored);
    } catch {
      // A failed rehydrate just starts a fresh conversation on the next send.
    }
  }, [getToken]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
      setMessages((current) => [...current, userMessage]);
      setSending(true);
      setStatus("analyzing");

      let assistantMessageId: string | null = null;
      let assistantText = "";

      try {
        const headers = { ...(await authHeaders()), "content-type": "application/json" };
        const response = await fetch(`${apiBaseUrl}/api/v1/admin/chat/messages/stream`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            conversationId: conversationIdRef.current ?? undefined,
            message: trimmed,
            context: buildChatRequestContext()
          })
        });

        if (!response.ok || !response.body) {
          setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system-error", content: "Aether Chat could not respond right now." }]);
          setStatus("idle");
          setSending(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, remainder } = parseSseFrames(buffer);
          buffer = remainder;

          for (const { event, data } of events) {
            if (event === "chat.conversation") {
              const { conversationId } = data as { conversationId: string };
              conversationIdRef.current = conversationId;
              storeConversationId(conversationId);
            } else if (event === "chat.status") {
              const { phase } = data as { phase: ChatStatusPhase };
              setStatus(phase);
            } else if (event === "chat.text_delta") {
              const { text: delta } = data as { text: string };
              assistantText += delta;
              if (!assistantMessageId) {
                assistantMessageId = crypto.randomUUID();
                const id = assistantMessageId;
                setMessages((current) => [...current, { id, role: "assistant", content: assistantText }]);
              } else {
                const id = assistantMessageId;
                setMessages((current) => current.map((message) => (message.id === id ? { ...message, content: assistantText } : message)));
              }
            } else if (event === "chat.tool_result") {
              const { toolName, message, artifact } = data as { toolName: string; message: string; artifact: ChatArtifact };
              setMessages((current) => [...current, { id: crypto.randomUUID(), role: "tool", toolName, content: message, artifact }]);
            } else if (event === "chat.error") {
              const { message } = data as { message: string };
              setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system-error", content: message }]);
            } else if (event === "chat.completed") {
              const { message } = data as { message: string };
              if (message && !assistantMessageId) {
                setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: message }]);
              }
            }
          }
        }
      } catch {
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system-error", content: "The connection to Aether Chat was interrupted." }]);
      } finally {
        setStatus("idle");
        setSending(false);
      }
    },
    [getToken, sending]
  );

  const confirmPendingAction = useCallback(
    async (operationId: string) => {
      setStatus("executing");
      try {
        const headers = await authHeaders();
        const response = await fetch(`${apiBaseUrl}/api/v1/admin/chat/actions/${encodeURIComponent(operationId)}/confirm`, {
          method: "POST",
          headers
        });
        const payload = (await response.json()) as { success: boolean; data?: Record<string, unknown>; error?: { message?: string } };
        setResolvedOperationIds((current) => new Set(current).add(operationId));

        if (!payload.success || !payload.data) {
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: "tool",
              toolName: "confirm_action",
              content: payload.error?.message ?? "That action could not be completed.",
              artifact: { type: "receipt", operationId, status: "failed", summary: payload.error?.message ?? "That action could not be completed.", result: {} }
            }
          ]);
          return;
        }

        const result = { ...payload.data };
        delete result.replay;
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "tool",
            toolName: "confirm_action",
            content: "Done.",
            artifact: { type: "receipt", operationId, status: "succeeded", summary: "Done.", result: result as Record<string, unknown> }
          }
        ]);
      } catch {
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system-error", content: "Could not reach the server to confirm this action." }]);
      } finally {
        setStatus("idle");
      }
    },
    [getToken]
  );

  return { messages, status, sending, resolvedOperationIds, hydrate, sendMessage, confirmPendingAction };
}
