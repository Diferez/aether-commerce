import { describe, expect, it } from "vitest";
import { parseSseFrames } from "./parseSseFrames";

describe("parseSseFrames", () => {
  it("parses a complete event/data frame", () => {
    const { events, remainder } = parseSseFrames('event: chat.status\ndata: {"phase":"analyzing"}\n\n');
    expect(events).toEqual([{ event: "chat.status", data: { phase: "analyzing" } }]);
    expect(remainder).toBe("");
  });

  it("parses multiple frames in one buffer", () => {
    const buffer = 'event: chat.text_delta\ndata: {"text":"Hi"}\n\nevent: chat.completed\ndata: {"message":"Hi"}\n\n';
    const { events } = parseSseFrames(buffer);
    expect(events).toEqual([
      { event: "chat.text_delta", data: { text: "Hi" } },
      { event: "chat.completed", data: { message: "Hi" } }
    ]);
  });

  it("carries an incomplete trailing frame over as the remainder", () => {
    const { events, remainder } = parseSseFrames('event: chat.status\ndata: {"phase":"analy');
    expect(events).toEqual([]);
    expect(remainder).toBe('event: chat.status\ndata: {"phase":"analy');
  });

  it("resumes correctly once the remainder is fed back in with the rest of the frame", () => {
    const first = parseSseFrames('event: chat.status\ndata: {"pha');
    const second = parseSseFrames(`${first.remainder}se":"analyzing"}\n\n`);
    expect(second.events).toEqual([{ event: "chat.status", data: { phase: "analyzing" } }]);
  });

  it("drops a frame with malformed JSON instead of throwing", () => {
    const buffer = "event: chat.error\ndata: {not json}\n\nevent: chat.completed\ndata: {\"message\":\"ok\"}\n\n";
    const { events } = parseSseFrames(buffer);
    expect(events).toEqual([{ event: "chat.completed", data: { message: "ok" } }]);
  });

  it("defaults the event name to 'message' when no event: line is present", () => {
    const { events } = parseSseFrames('data: {"x":1}\n\n');
    expect(events).toEqual([{ event: "message", data: { x: 1 } }]);
  });

  it("returns nothing for an empty buffer", () => {
    expect(parseSseFrames("")).toEqual({ events: [], remainder: "" });
  });
});
