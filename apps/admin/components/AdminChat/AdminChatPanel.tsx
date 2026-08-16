"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@aether/ui";
import { Send, Sparkles, X } from "lucide-react";
import { useAdminChat } from "./AdminChatProvider";
import { MessageList } from "./MessageList";
import { StatusIndicator } from "./StatusIndicator";
import { buildChatRequestContext } from "./useAdminChatContext";
import { useAdminLanguage } from "../AdminLanguageProvider";
import type { AdminDictionary } from "@aether/i18n";
import type { ChatStatusPhase } from "./types";

function getSuggestionsByModule(t: AdminDictionary): Record<string, string[]> {
  return {
    orders: [t.chat.suggestionOrdersPending, t.chat.suggestionWhatHappenedToday],
    products: [t.chat.suggestionLowStock, t.chat.suggestionOutOfStock],
    inventory: [t.chat.suggestionLowStock, t.chat.suggestionWhatHappenedToday],
    customers: [t.chat.suggestionWhatHappenedToday],
    home: [t.chat.suggestionOrdersPending, t.chat.suggestionLowStock, t.chat.suggestionWhatHappenedToday]
  };
}

export function AdminChatPanel() {
  const { open, closePanel, messages, status, sending, resolvedOperationIds, sendMessage, confirmPendingAction } = useAdminChat();
  const { t } = useAdminLanguage();
  const suggestionsByModule = useMemo(() => getSuggestionsByModule(t), [t]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, status]);

  function submit(text: string) {
    if (!text.trim() || sending) return;
    void sendMessage(text);
    setInput("");
  }

  const suggestions = messages.length === 0 ? suggestionsByModule[buildChatRequestContext().module] ?? suggestionsByModule.home! : [];

  // "Waiting for confirmation" is a client-derived phase, not something the
  // server emits as chat.status (see StatusIndicator's comment) - it's true
  // whenever the last tool result is a pending action nobody has resolved yet.
  const lastMessage = messages[messages.length - 1];
  const waitingForConfirmation =
    !sending && lastMessage?.role === "tool" && lastMessage.artifact.type === "pending_action" && !resolvedOperationIds.has(lastMessage.artifact.operationId);
  const displayedPhase: ChatStatusPhase | null = sending ? (status === "idle" ? "analyzing" : status) : waitingForConfirmation ? "waiting_for_confirmation" : null;

  return (
    <Sheet open={open} onClose={closePanel} side="right" width="min(480px,100vw)" padded={false}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white">
              <Sparkles size={16} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{t.chat.title}</p>
              <p className="text-xs text-ink-subtle">{t.chat.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closePanel}
            aria-label={t.chat.minimize}
            className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div ref={listRef} className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4">
          <MessageList messages={messages} resolvedOperationIds={resolvedOperationIds} onConfirmAction={(operationId) => void confirmPendingAction(operationId)} />
        </div>

        {displayedPhase ? (
          <div className="px-4 pb-2">
            <StatusIndicator phase={displayedPhase} />
          </div>
        ) : null}

        {suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => submit(suggestion)}
                className="focus-ring rounded-full border border-border-strong px-3 py-1 text-xs font-medium text-ink-muted hover:bg-surface-hover hover:text-ink"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="flex items-center gap-2 border-t border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(input);
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t.chat.inputPlaceholder}
            aria-label={t.chat.messageLabel}
            disabled={sending}
            className="focus-ring min-h-11 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-ink placeholder:text-ink-subtle disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label={t.chat.send}
            className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={16} aria-hidden />
          </button>
        </form>
      </div>
    </Sheet>
  );
}
