import { vi } from "vitest";
import type { Env } from "../../types";
import type { Actor } from "@aether-commerce/schemas";
import type { AdminChatContext } from "./context";

// Shared by every admin-chat test file (tools, pending-actions, routes) -
// same queued-response D1 mock shape as apps/api/src/routes/admin.integration.test.ts
// and services/customers.test.ts, pulled into one place because admin-chat
// has enough test files that repeating this harness in each would be actual
// duplication, not the small-scale kind this codebase otherwise prefers.
export type QueuedResponse = { first?: unknown; all?: unknown[]; run?: { changes?: number } };

export function fakeEnv(responses: QueuedResponse[] = [], overrides: Partial<Env> = {}) {
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
    ADMIN_CHAT_MUTATIONS_ENABLED: "true",
    ADMIN_CHAT_PENDING_ACTION_TTL_MINUTES: "5",
    ...overrides
  } as unknown as Env;
  return { env, db, statements };
}

export function fakeActor(overrides: Partial<Actor> = {}): Actor {
  return { userId: "usr_admin", roles: ["admin"], permissions: [], mode: "private", ...overrides };
}

export function fakeContext(
  env: Env,
  actorOverrides: Partial<Actor> = {},
  contextOverrides: Partial<Pick<AdminChatContext, "visible" | "language">> = {}
): AdminChatContext {
  return {
    env,
    actor: fakeActor(actorOverrides),
    requestId: "req_test",
    conversationId: "conv_test",
    visible: {},
    language: "en",
    ...contextOverrides
  };
}
