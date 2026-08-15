import { Loader2, Search, ClipboardCheck, Play, HelpCircle } from "lucide-react";
import type { ChatStatusPhase } from "./types";

const labels: Record<ChatStatusPhase, string> = {
  analyzing: "Analyzing...",
  consulting: "Consulting data...",
  preparing: "Preparing an action...",
  waiting_for_confirmation: "Waiting for your confirmation",
  executing: "Executing...",
  done: "Done"
};

const icons: Record<ChatStatusPhase, typeof Loader2> = {
  analyzing: Loader2,
  consulting: Search,
  preparing: ClipboardCheck,
  waiting_for_confirmation: HelpCircle,
  executing: Play,
  done: Loader2
};

export function StatusIndicator({ phase }: { phase: ChatStatusPhase }) {
  const Icon = icons[phase];
  return (
    <div className="flex items-center gap-2 rounded-md bg-surface-hover px-3 py-2 text-xs font-medium text-ink-muted">
      <Icon size={14} className={phase === "waiting_for_confirmation" ? undefined : "animate-spin"} aria-hidden />
      {labels[phase]}
    </div>
  );
}
