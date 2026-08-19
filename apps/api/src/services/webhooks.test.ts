import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { listRecentWebhookEvents } from "./webhooks";

function fakeEnv(all: unknown[] = []) {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => {
        statements.push({ sql, args });
        return { all: vi.fn(() => Promise.resolve({ results: all })) };
      })
    }))
  };
  return { env: { DB: db } as unknown as Env, statements };
}

describe("listRecentWebhookEvents", () => {
  it("never selects payload_json - only the minimized fields either surface needs", async () => {
    const { env, statements } = fakeEnv([]);
    await listRecentWebhookEvents(env, { limit: 20 });
    expect(statements[0]!.sql).not.toContain("payload_json");
  });

  it("builds a parameterized WHERE clause from status/provider filters", async () => {
    const { env, statements } = fakeEnv([]);
    await listRecentWebhookEvents(env, { status: "failed", provider: "stripe", limit: 10 });
    expect(statements[0]!.sql).toContain("status = ?");
    expect(statements[0]!.sql).toContain("provider = ?");
    expect(statements[0]!.args).toEqual(["failed", "stripe", 10]);
  });

  it("returns an empty array instead of null/undefined when there are no rows", async () => {
    const { env } = fakeEnv([]);
    expect(await listRecentWebhookEvents(env, { limit: 20 })).toEqual([]);
  });

  it("orders by most recent first with no filters applied", async () => {
    const { env, statements } = fakeEnv([{ provider: "stripe", provider_event_id: "evt_1" }]);
    const rows = await listRecentWebhookEvents(env, { limit: 5 });
    expect(statements[0]!.sql).not.toContain("where");
    expect(statements[0]!.sql).toContain("order by created_at desc limit ?");
    expect(rows).toHaveLength(1);
  });
});
