export type ParsedSseEvent = { event: string; data: unknown };

// Pure - no fetch/DOM dependency - so it's testable with plain strings in
// and parsed events out, independent of the streaming plumbing in
// useAdminChatStream.ts. Frames are `event: <name>\ndata: <json>\n\n`,
// matching apps/api/src/services/admin-chat/sse.ts's encoder exactly.
export function parseSseFrames(buffer: string): { events: ParsedSseEvent[]; remainder: string } {
  const frames = buffer.split("\n\n");
  const remainder = frames.pop() ?? "";
  const events: ParsedSseEvent[] = [];

  for (const frame of frames) {
    if (!frame.trim()) continue;
    let eventName = "message";
    let dataLine: string | null = null;
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
    }
    if (dataLine === null) continue;
    try {
      events.push({ event: eventName, data: JSON.parse(dataLine) as unknown });
    } catch {
      // A malformed frame is dropped rather than aborting the whole stream.
    }
  }

  return { events, remainder };
}
