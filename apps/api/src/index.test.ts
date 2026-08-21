import { describe, expect, it, vi } from "vitest";
import type { Env } from "@aether/api-worker";
import worker from "./index";

describe("scheduled handler", () => {
  it("expires active reservations past their expiry, binding a real ISO timestamp (not CURRENT_TIMESTAMP)", async () => {
    const statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        const statement = {
          sql,
          args: [] as unknown[],
          bind: vi.fn((...args: unknown[]) => {
            statement.args = args;
            return statement;
          }),
          run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 0 } })),
          // sendDueRestockNotifications' own bind-less select - no pending
          // notifications to send in this test, so an empty result is a
          // safe, correct default rather than a mock gap.
          all: vi.fn(() => Promise.resolve({ results: [] }))
        };
        statements.push(statement);
        return statement;
      }),
      batch: vi.fn(() => Promise.resolve([]))
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

    // Comparing expires_at against a bound parameter, not inline
    // CURRENT_TIMESTAMP - that's the whole point of this test.
    const reservationStatement = statements.find((entry) => entry.sql.includes("inventory_reservations"));
    expect(reservationStatement?.sql).toContain("status = 'active' and expires_at < ?");
    const [boundTimestamp] = reservationStatement!.args;
    expect(typeof boundTimestamp).toBe("string");
    // ISO 8601 with T/Z, not SQLite's CURRENT_TIMESTAMP "YYYY-MM-DD HH:MM:SS" shape.
    expect(boundTimestamp as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const taskRunStatement = statements.find((entry) => entry.sql.includes("task_runs"));
    expect(taskRunStatement?.args).toEqual(["inventory_reservation_expiry", "ok", null]);
    expect(statements.some((entry) => entry.sql.includes("checkout_snapshots"))).toBe(true);
    expect(statements.some((entry) => entry.sql.includes("webhook_events"))).toBe(true);
  });

  it("records a failed task run (and re-throws) when the reservation-expiry update itself fails", async () => {
    const statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        const statement = {
          sql,
          args: [] as unknown[],
          bind: vi.fn((...args: unknown[]) => {
            statement.args = args;
            return statement;
          }),
          run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } }))
        };
        statements.push(statement);
        return statement;
      }),
      batch: vi.fn(() => Promise.reject(new Error("D1 unavailable")))
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
