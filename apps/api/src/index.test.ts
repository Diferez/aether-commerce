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
    // A real Cloudflare invocation always supplies a real ExecutionContext -
    // Sentry's withSentry wrapper (instrumenting scheduled()) calls
    // ctx.waitUntil() to flush events after the handler returns, so this
    // fake needs a working waitUntil, not just an empty object.
    const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
    const controller = { scheduledTime: Date.now(), cron: "" } as ScheduledController;
    await worker.scheduled(controller, { DB: db } as unknown as Env, ctx);

    // The reservation-expiry update, then recordTaskRun's task_runs upsert
    // ("System health" reads this back for staleness).
    expect(statements).toHaveLength(2);
    // Comparing expires_at against a bound parameter, not inline
    // CURRENT_TIMESTAMP - that's the whole point of this test.
    expect(statements[0]?.sql).toContain("status = 'active' and expires_at < ?");
    const [boundTimestamp] = statements[0]!.args;
    expect(typeof boundTimestamp).toBe("string");
    // ISO 8601 with T/Z, not SQLite's CURRENT_TIMESTAMP "YYYY-MM-DD HH:MM:SS" shape.
    expect(boundTimestamp as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(statements[1]?.sql).toContain("task_runs");
    expect(statements[1]?.args).toEqual(["inventory_reservation_expiry", "ok", null]);
  });

  it("records a failed task run (and re-throws) when the reservation-expiry update itself fails", async () => {
    const statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...args: unknown[]) => {
          statements.push({ sql, args });
          if (sql.includes("inventory_reservations")) {
            return { run: vi.fn(() => Promise.reject(new Error("D1 unavailable"))) };
          }
          return { run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })) };
        })
      }))
    };
    if (typeof worker.scheduled !== "function") {
      throw new Error("expected worker.scheduled to be a function");
    }
    const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
    const controller = { scheduledTime: Date.now(), cron: "" } as ScheduledController;

    await expect(worker.scheduled(controller, { DB: db } as unknown as Env, ctx)).rejects.toThrow("D1 unavailable");

    const taskRunStatement = statements.find((s) => s.sql.includes("task_runs"));
    expect(taskRunStatement?.args).toEqual(["inventory_reservation_expiry", "failed", "D1 unavailable"]);
  });
});
