import { Loader2, Search, ClipboardCheck, Play, HelpCircle } from "lucide-react";
import type { AdminDictionary } from "@aether/i18n";
import { useAdminLanguage } from "../AdminLanguageProvider";
import type { ChatStatusPhase } from "./types";

function getLabels(t: AdminDictionary): Record<ChatStatusPhase, string> {
  return {
    analyzing: t.chat.phaseAnalyzing,
    consulting: t.chat.phaseConsulting,
    preparing: t.chat.phasePreparing,
    waiting_for_confirmation: t.chat.phaseWaitingConfirmation,
    executing: t.chat.phaseExecuting,
    done: t.chat.phaseDone
  };
}

const icons: Record<ChatStatusPhase, typeof Loader2> = {
  analyzing: Loader2,
  consulting: Search,
  preparing: ClipboardCheck,
  waiting_for_confirmation: HelpCircle,
  executing: Play,
  done: Loader2
};

export function StatusIndicator({ phase }: { phase: ChatStatusPhase }) {
  const { t } = useAdminLanguage();
  const Icon = icons[phase];
  return (
    <div className="flex items-center gap-2 rounded-md bg-surface-hover px-3 py-2 text-xs font-medium text-ink-muted">
      <Icon size={14} className={phase === "waiting_for_confirmation" ? undefined : "animate-spin"} aria-hidden />
      {getLabels(t)[phase]}
    </div>
  );
}
