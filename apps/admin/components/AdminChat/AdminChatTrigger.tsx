"use client";

import { Sparkles } from "lucide-react";
import { useAdminChat } from "./AdminChatProvider";

// Persistent floating trigger, mounted once in AdminShell so it (and the
// conversation state behind it) survives opening/closing the panel. Hidden
// while the panel itself is open to avoid overlapping it.
export function AdminChatTrigger() {
  const { open, openPanel, messages } = useAdminChat();

  if (open) return null;

  return (
    <button
      type="button"
      onClick={openPanel}
      aria-label="Open Aether Chat"
      className="focus-ring fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-elevate-md hover:bg-accent-hover"
    >
      <Sparkles size={22} aria-hidden />
      {messages.length > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-success" aria-hidden />
      ) : null}
    </button>
  );
}
