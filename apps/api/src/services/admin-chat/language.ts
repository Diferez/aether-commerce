// The admin panel's own two locales (see apps/admin's AdminLanguageProvider,
// "aether.admin.locale.v1") - Aether Chat's tools build user-facing text
// (list captions, mutation-preview summaries, error messages) that gets
// shown verbatim in the chat UI, never paraphrased by the model first (see
// MessageList.tsx: `message.artifact.displayMessage ?? message.content`),
// so a Spanish-speaking operator saw English mixed into every card unless
// each tool branches on this. The model's own generated prose already
// follows the operator's language per the system prompt - this only covers
// the words tools write themselves.
export type ChatLanguage = "en" | "es";

export function pick(language: ChatLanguage, en: string, es: string): string {
  return language === "es" ? es : en;
}
