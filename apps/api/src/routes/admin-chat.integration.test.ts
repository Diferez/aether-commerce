import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIMessageChunk } from "@langchain/core/messages";
import type { Env } from "../types";
import type * as AiProviderModule from "../services/ai-provider";
import worker from "../index";

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  jwtVerify: vi.fn()
}));

const resolveChatModelMock = vi.fn<(...args: unknown[]) => ReturnType<typeof AiProviderModule.resolveChatModel>>();
vi.mock("../services/ai-provider", async () => {
  const actual = await vi.importActual<typeof AiProviderModule>("../services/ai-provider");
  return { ...actual, resolveChatModel: (...args: unknown[]) => resolveChatModelMock(...args) };
});

type QueuedResponse = { first?: unknown; all?: unknown[]; run?: { changes?: number } };

function fakeEnv(responses: QueuedResponse[] = [], overrides: Partial<Env> = {}) {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  let callIndex = 0;
  const db = {
    prepare: vi.fn((sql: string) => {
      const response = responses[callIndex] ?? {};
      callIndex += 1;
      return {
        bind: vi.fn((...args: unknown[]) => {
          statements.push({ sql, args });
          return {
            first: vi.fn(() => Promise.resolve(response.first ?? null)),
            all: vi.fn(() => Promise.resolve({ results: response.all ?? [] })),
            run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: response.run?.changes ?? 1 } }))
          };
        }),
        first: vi.fn(() => Promise.resolve(response.first ?? null)),
        all: vi.fn(() => Promise.resolve({ results: response.all ?? [] })),
        run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: response.run?.changes ?? 1 } }))
      };
    }),
    batch: vi.fn((stmts: unknown[]) => Promise.resolve(stmts.map(() => ({ success: true, meta: { changes: 1 } }))))
  };
  const env = {
    DB: db,
    CLERK_JWT_ISSUER: "https://clerk.test",
    GEMINI_API_KEY: "test-key",
    ADMIN_CHAT_MUTATIONS_ENABLED: "true",
    ...overrides
  } as unknown as Env;
  return { env, db, statements };
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function chatRequest(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, headers, ...rest } = init;
  return new Request(`https://api.example.com/api/v1/admin/chat${path}`, {
    ...rest,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...((headers as Record<string, string>) ?? {})
    }
  });
}

async function mockVerifiedActor(roles: string[], sub = "usr_1") {
  const jose = await import("jose");
  vi.mocked(jose.jwtVerify).mockResolvedValueOnce({ payload: { sub, public_metadata: { roles } } } as never);
}

// Same fake shape as services/admin-chat/loop.test.ts's fakeModel - one
// array of AIMessageChunks per agent-node pass through the graph. None of
// these turns are complex enough (>1 tool call) to reach verifyNode's LLM
// critic, so withStructuredOutput only needs to exist, never do anything.
function fakeModel(turns: AIMessageChunk[][]) {
  let call = 0;
  return {
    bindTools: () => ({
      async stream() {
        await Promise.resolve();
        const chunks = turns[call] ?? [new AIMessageChunk({ content: "" })];
        call += 1;
        return (async function* () {
          await Promise.resolve();
          for (const chunk of chunks) yield chunk;
        })();
      }
    }),
    withStructuredOutput: () => ({ invoke: () => Promise.resolve({ ok: true, feedback: "" }) })
  };
}

describe("admin chat routes integration (real middleware chain, mocked D1 and provider)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when confirming an operationId that does not exist", async () => {
    await mockVerifiedActor(["admin"]);
    const { env } = fakeEnv([
      { first: null }, // suspension check
      { first: null } // claimPendingAction: no such row
    ]);

    const response = await worker.fetch(chatRequest("/actions/pact_missing/confirm", { method: "POST", token: "tok" }), env, ctx);

    expect(response.status).toBe(404);
    const body = await response.json<{ error?: { code: string } }>();
    expect(body.error?.code).toBe("OPERATION_NOT_FOUND");
  });

  it("replays the cached receipt on a duplicate confirm instead of executing the mutation twice", async () => {
    await mockVerifiedActor(["admin"], "usr_1");
    const { env, db } = fakeEnv([
      { first: null }, // suspension check
      {
        first: {
          id: "pact_1",
          actor_id: "usr_1",
          status: "confirmed",
          result_json: JSON.stringify({ orderId: "ord_1", fulfillmentStatus: "shipped" }),
          diff_json: "{}",
          tool_name: "prepare_order_status_change",
          conversation_id: "conv_1",
          expires_at: new Date(Date.now() + 60_000).toISOString()
        }
      }
    ]);

    const response = await worker.fetch(chatRequest("/actions/pact_1/confirm", { method: "POST", token: "tok" }), env, ctx);

    expect(response.status).toBe(200);
    const body = await response.json<{ data: { replay: boolean; orderId: string } }>();
    expect(body.data).toMatchObject({ replay: true, orderId: "ord_1", fulfillmentStatus: "shipped" });
    // Only the suspension check + the single pending-action lookup ran - no
    // update/execute statement was issued for an already-confirmed action.
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });

  it("surfaces a permission denial from a tool call all the way through the real HTTP path, without pretending anything happened", async () => {
    await mockVerifiedActor(["support"], "usr_2"); // support has no orders.write
    resolveChatModelMock.mockReturnValue(
      fakeModel([
        [
          new AIMessageChunk({
            content: "",
            tool_calls: [{ name: "prepare_order_status_change", args: { orderId: "ord_1", fulfillmentStatus: "shipped" }, id: "call_1" }]
          })
        ],
        [new AIMessageChunk({ content: "I could not do that." })]
      ]) as unknown as ReturnType<typeof AiProviderModule.resolveChatModel>
    );
    const { env } = fakeEnv([
      { first: null }, // suspension check
      {}, // loadOrCreateConversation: no conversationId given, so this is the insert (no select)
      { all: [] }, // loadHistory: no prior messages
      {}, // insert user message
      {}, // insert tool-result message (permission-denied artifact) - the tool itself never touches D1
      {} // insert final assistant message
    ]);

    const response = await worker.fetch(
      chatRequest("/messages", {
        method: "POST",
        token: "tok",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Mark order ord_1 as shipped" })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ data: { toolResults: Array<{ artifact: { type: string; code?: string } }> } }>();
    expect(body.data.toolResults[0]?.artifact).toMatchObject({ type: "error", code: "FORBIDDEN" });
  });
});
