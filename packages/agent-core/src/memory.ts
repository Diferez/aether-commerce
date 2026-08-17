export type AgentConversation = {
  id: string;
  sessionHash: string;
  locale: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentConversationMessage = {
  id: string;
  role: string;
  content: string | null;
  payload: unknown;
  createdAt: string;
};

export type AgentConversationWrite = {
  threadId: string;
  sessionHash: string;
  locale: string;
  role: "user" | "assistant";
  content: string;
  payload: unknown;
};

export interface AgentConversationMemoryRepository {
  findConversation(threadId: string): Promise<AgentConversation | null>;
  listMessages(threadId: string): Promise<AgentConversationMessage[]>;
  persistMessage(input: AgentConversationWrite): Promise<void>;
  deleteConversation(threadId: string): Promise<void>;
}

export type AgentConversationReadResult =
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "found"; conversation: AgentConversation; messages: AgentConversationMessage[] };

export type AgentConversationDeleteResult =
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "deleted" };

/**
 * Provider-neutral ownership and lifecycle policy for persisted assistant
 * conversations. Database encoding and retention remain adapter concerns.
 */
export class AgentConversationMemory {
  constructor(private readonly repository: AgentConversationMemoryRepository) {}

  async read(threadId: string, actorSessionHash: string): Promise<AgentConversationReadResult> {
    const conversation = await this.repository.findConversation(threadId);
    if (!conversation || conversation.status !== "active") return { status: "not_found" };
    if (conversation.sessionHash !== actorSessionHash) return { status: "forbidden" };
    return { status: "found", conversation, messages: await this.repository.listMessages(threadId) };
  }

  async delete(threadId: string, actorSessionHash: string): Promise<AgentConversationDeleteResult> {
    const conversation = await this.repository.findConversation(threadId);
    if (!conversation || conversation.status !== "active") return { status: "not_found" };
    if (conversation.sessionHash !== actorSessionHash) return { status: "forbidden" };
    await this.repository.deleteConversation(threadId);
    return { status: "deleted" };
  }

  persist(input: AgentConversationWrite): Promise<void> {
    return this.repository.persistMessage(input);
  }
}
