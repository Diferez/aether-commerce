import { describe, expect, it, vi } from "vitest";
import type { Env } from "./types";
import worker from "./index";

describe("scheduled handler", () => {
  it("expires active reservations past their expiry, binding a real ISO timestamp (not CURRENT_TIMESTAMP)", async () => {
    const statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...args: unknown[]) => {
          statements.push({ sql, args });
          return { run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 0 } })) };
        })
      }))
    };

    if (typeof worker.scheduled !== "function") {
      throw new Error("expected worker.scheduled to be a function");
    }
    await worker.scheduled({} as never, { DB: db } as unknown as Env);

    expect(statements).toHaveLength(1);
    // Comparing expires_at against a bound parameter, not inline
    // CURRENT_TIMESTAMP - that's the whole point of this test.
    expect(statements[0]?.sql).toContain("status = 'active' and expires_at < ?");
    const [boundTimestamp] = statements[0]!.args;
    expect(typeof boundTimestamp).toBe("string");
    // ISO 8601 with T/Z, not SQLite's CURRENT_TIMESTAMP "YYYY-MM-DD HH:MM:SS" shape.
    expect(boundTimestamp as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
