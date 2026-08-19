import { describe, expect, it } from "vitest";
import {
  AgentConversationMemory,
  type AgentConversation,
  type AgentConversationMemoryRepository,
  type AgentConversationMessage
} from "./memory";

describe("agent conversation memory", () => {
  it("enforces active-conversation ownership before returning messages or deleting data", async () => {
    const conversation: AgentConversation = {
      id: "thread-1",
      sessionHash: "owner",
      locale: "es-CO",
      status: "active",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01"
    };
    const messages: AgentConversationMessage[] = [{
      id: "message-1",
      role: "user",
      content: "hola",
      payload: { message: "hola" },
      createdAt: "2026-01-01"
    }];
    let deleted = false;
    const repository: AgentConversationMemoryRepository = {
      findConversation: (threadId) => Promise.resolve(threadId === conversation.id ? (deleted ? { ...conversation, status: "deleted" } : conversation) : null),
      listMessages: () => Promise.resolve(messages),
      persistMessage: () => Promise.resolve(),
      deleteConversation: () => {
        deleted = true;
        return Promise.resolve();
      }
    };
    const memory = new AgentConversationMemory(repository);

    expect(await memory.read("thread-1", "other")).toEqual({ status: "forbidden" });
    expect(await memory.read("missing", "owner")).toEqual({ status: "not_found" });
    expect(await memory.delete("thread-1", "other")).toEqual({ status: "forbidden" });
    expect(await memory.delete("thread-1", "owner")).toEqual({ status: "deleted" });
    expect(await memory.read("thread-1", "owner")).toEqual({ status: "not_found" });
  });
});
