export type AgentModelRequest = {
  systemPrompt: string;
  message: string;
  temperature: number;
  maxOutputTokens: number;
  responseMimeType?: "application/json";
};

export type AgentTextModel = {
  generate(request: AgentModelRequest): Promise<string | null>;
};

export type GeminiRestProviderOptions = {
  apiKey?: string;
  model: string;
  fetch: typeof globalThis.fetch;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

/**
 * A small Gemini REST adapter deliberately independent of any store runtime.
 * Callers own timeouts, usage accounting, retries and secret bindings.
 */
export function createGeminiRestProvider(options: GeminiRestProviderOptions): AgentTextModel | null {
  if (!options.apiKey) return null;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`;
  return {
    async generate(request) {
      const response = await options.fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: request.message }] }],
          generationConfig: {
            temperature: request.temperature,
            maxOutputTokens: request.maxOutputTokens,
            ...(request.responseMimeType ? { responseMimeType: request.responseMimeType } : {})
          }
        })
      });
      if (!response.ok) return null;
      const data = (await response.json()) as GeminiResponse;
      return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || null;
    }
  };
}
