// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAdminChatStream } from "./useAdminChatStream";

const getTokenMock = vi.fn(() => Promise.resolve(null));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ getToken: getTokenMock })
}));

const fetchMock = vi.fn();

function sseChunk(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    }
  });
  return new Response(stream, { status: 200 });
}

describe("useAdminChatStream", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.sessionStorage.clear();
  });

  it("sends a message and appends the user, tool-result, and final assistant messages as the stream arrives", async () => {
    fetchMock.mockResolvedValueOnce(
      streamResponse([
        sseChunk("chat.conversation", { conversationId: "conv_1" }),
        sseChunk("chat.status", { phase: "analyzing" }),
        sseChunk("chat.tool_result", { toolName: "get_pending_orders", message: "1 order is pending.", artifact: { type: "order_list", orders: [] } }),
        sseChunk("chat.text_delta", { text: "Here you go." }),
        sseChunk("chat.completed", { message: "Here you go." })
      ])
    );

    const { result } = renderHook(() => useAdminChatStream());

    await act(async () => {
      await result.current.sendMessage("Show pending orders");
    });

    await waitFor(() => expect(result.current.sending).toBe(false));

    const roles = result.current.messages.map((message) => message.role);
    expect(roles).toEqual(["user", "tool", "assistant"]);
    expect(result.current.messages[0]).toMatchObject({ role: "user", content: "Show pending orders" });
    expect(result.current.messages[2]).toMatchObject({ role: "assistant", content: "Here you go." });
    expect(window.sessionStorage.getItem("aether.admin.chat.conversationId.v1")).toBe("conv_1");
  });

  it("does not send an empty or whitespace-only message", async () => {
    const { result } = renderHook(() => useAdminChatStream());

    await act(async () => {
      await result.current.sendMessage("   ");
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(0);
  });

  it("shows a system error message when the stream response is not ok", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const { result } = renderHook(() => useAdminChatStream());

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(result.current.messages.some((message) => message.role === "system-error")).toBe(true);
  });

  it("confirms a pending action and records it as resolved with a receipt message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { operationId: "pact_1", orderId: "ord_1", fulfillmentStatus: "shipped" } })
    } as Response);

    const { result } = renderHook(() => useAdminChatStream());

    await act(async () => {
      await result.current.confirmPendingAction("pact_1");
    });

    expect(result.current.resolvedOperationIds.has("pact_1")).toBe(true);
    const receipt = result.current.messages.at(-1);
    expect(receipt).toMatchObject({ role: "tool", artifact: { type: "receipt", status: "succeeded" } });
  });

  it("records a failed confirmation as a failed receipt without marking the action as succeeded", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: false, error: { message: "The order changed." } })
    } as Response);

    const { result } = renderHook(() => useAdminChatStream());

    await act(async () => {
      await result.current.confirmPendingAction("pact_2");
    });

    const receipt = result.current.messages.at(-1);
    expect(receipt).toMatchObject({ role: "tool", artifact: { type: "receipt", status: "failed" } });
  });

  it("rehydrates prior messages from the server when a conversationId is stored in sessionStorage", async () => {
    window.sessionStorage.setItem("aether.admin.chat.conversationId.v1", "conv_old");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            messages: [
              { id: "m1", role: "user", content: "Hi", toolCall: null },
              { id: "m2", role: "assistant", content: "Hello!", toolCall: null }
            ]
          }
        })
    } as Response);

    const { result } = renderHook(() => useAdminChatStream());

    await act(async () => {
      await result.current.hydrate();
    });

    expect(result.current.messages).toEqual([
      { id: "m1", role: "user", content: "Hi" },
      { id: "m2", role: "assistant", content: "Hello!" }
    ]);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/admin/chat/conversations/conv_old"), expect.anything());
  });
});
