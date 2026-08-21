const encoder = new TextEncoder();

// Same low-level framing apps/ai-assistant/worker.ts already uses - copied
// as its own tiny helper rather than shared across the two deployables.
export function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
