import type { AgentModelRequest, AgentTextModel } from "./providers/gemini-rest";

export type AgentModelExecutionOptions = {
  provider: AgentTextModel | null;
  request: AgentModelRequest;
  /** Kept at one by the current Worker; clients may opt into retries explicitly. */
  maxAttempts?: number;
  onAttempt?: (attempt: number) => Promise<void> | void;
};

/**
 * Executes a text model behind a provider-neutral boundary. Failed calls and
 * empty responses are retried only when an implementation opts in; callers
 * therefore retain control over quotas, latency and usage accounting.
 */
export async function executeAgentModelText(options: AgentModelExecutionOptions): Promise<string | null> {
  if (!options.provider) return null;
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 1));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await options.onAttempt?.(attempt);
    try {
      const value = await options.provider.generate(options.request);
      if (value) return value;
    } catch {
      // The app adapter decides whether to expose a fallback or an error.
    }
  }
  return null;
}

/** Converts untrusted JSON-only model output into a safe object fallback. */
export function parseAgentModelJson(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
