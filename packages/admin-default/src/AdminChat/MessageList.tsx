"use client";

import { AlertTriangle } from "lucide-react";
import { ToolResultCard } from "./ToolResultCard";
import { PendingActionCard } from "./PendingActionCard";
import { ReceiptCard } from "./ReceiptCard";
import { InlineMarkdown } from "./InlineMarkdown";
import { useAdminLanguage } from "../AdminLanguageProvider";
import type { ChatMessage } from "./types";

export function MessageList({
  messages,
  resolvedOperationIds,
  onConfirmAction
}: {
  messages: ChatMessage[];
  resolvedOperationIds: Set<string>;
  onConfirmAction: (operationId: string) => void;
}) {
  const { t } = useAdminLanguage();

  if (messages.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-ink-subtle">{t.chat.emptyState}</p>;
  }

  return (
    <div className="grid gap-3">
      {messages.map((message) => {
        if (message.role === "user") {
          return (
            <div key={message.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg rounded-tr-sm bg-accent px-3 py-2 text-sm text-white [overflow-wrap:anywhere]">
              {message.content}
            </div>
          );
        }
        if (message.role === "assistant") {
          return (
            <div key={message.id} className="max-w-[90%] whitespace-pre-wrap rounded-lg rounded-tl-sm bg-surface-hover px-3 py-2 text-sm text-ink [overflow-wrap:anywhere]">
              <InlineMarkdown text={message.content} />
            </div>
          );
        }
        if (message.role === "system-error") {
          return (
            <p key={message.id} className="flex items-start gap-1.5 text-sm text-danger [overflow-wrap:anywhere]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {message.content}
            </p>
          );
        }
        // role === "tool"
        if (message.artifact.type === "pending_action") {
          return (
            <PendingActionCard
              key={message.id}
              operationId={message.artifact.operationId}
              diff={message.artifact.diff}
              expiresAt={message.artifact.expiresAt}
              resolved={resolvedOperationIds.has(message.artifact.operationId)}
              onConfirm={onConfirmAction}
            />
          );
        }
        if (message.artifact.type === "receipt") {
          return <ReceiptCard key={message.id} status={message.artifact.status} summary={message.artifact.summary} result={message.artifact.result} />;
        }
        // displayMessage (set by the tool itself, e.g. get_system_health)
        // overrides the raw model-facing text when the card already fully
        // represents it - undefined means "no override", so every tool
        // that hasn't opted in keeps showing message.content exactly as
        // before. An empty string is a valid override (suppress entirely).
        const displayText = message.artifact.displayMessage ?? message.content;
        return (
          <div key={message.id} className="min-w-0 max-w-[95%]">
            {displayText ? <p className="mb-1.5 text-sm text-ink-muted [overflow-wrap:anywhere]">{displayText}</p> : null}
            <ToolResultCard artifact={message.artifact} />
          </div>
        );
      })}
    </div>
  );
}
