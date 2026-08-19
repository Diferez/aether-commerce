import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { averageLatencyMs, cleanupOldMetrics, getTaskRun, incrementMetric, recordLatencySample, recordTaskRun, sumMetric } from "./metrics";

type QueuedResponse = { first?: unknown; all?: unknown[]; run?: { changes?: number } };

function fakeEnv(responses: QueuedResponse[] = []) {
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
        })
      };
    })
  };
  return { env: { DB: db } as unknown as Env, statements };
}

describe("incrementMetric", () => {
  it("upserts an hourly bucket, adding to any existing value rather than overwriting it", async () => {
    const { env, statements } = fakeEnv();
    await incrementMetric(env, "webhooks_failed", 1);

    expect(statements).toHaveLength(1);
    expect(statements[0]!.sql).toContain("on conflict(metric_name, bucket) do update set value = value + excluded.value");
    const [, metricName, bucket, amount] = statements[0]!.args;
    expect(metricName).toBe("webhooks_failed");
    expect(bucket).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/);
    expect(amount).toBe(1);
  });

  it("defaults amount to 1 when omitted", async () => {
    const { env, statements } = fakeEnv();
    await incrementMetric(env, "application_errors");
    expect(statements[0]!.args[3]).toBe(1);
  });
});

describe("recordLatencySample", () => {
  it("never samples when sampleRate is 0", async () => {
    const { env, statements } = fakeEnv();
    await recordLatencySample(env, "admin", 250, 0);
    expect(statements).toHaveLength(0);
  });

  it("always samples when sampleRate is 1, recording both a sum and a count bucket", async () => {
    const { env, statements } = fakeEnv();
    await recordLatencySample(env, "admin", 250, 1);

    expect(statements).toHaveLength(2);
    expect(statements[0]!.args).toContain("latency_sum_ms:admin");
    expect(statements[0]!.args).toContain(250);
    expect(statements[1]!.args).toContain("latency_count:admin");
    expect(statements[1]!.args).toContain(1);
  });
});

describe("sumMetric", () => {
  it("sums only buckets from the requested lookback window", async () => {
    const { env, statements } = fakeEnv([{ first: { total: 12 } }]);
    const total = await sumMetric(env, "webhooks_failed", 24);

    expect(total).toBe(12);
    expect(statements[0]!.sql).toContain("bucket >= ?");
  });

  it("returns 0 when there is no data yet, instead of null/undefined", async () => {
    const { env } = fakeEnv([{ first: null }]);
    expect(await sumMetric(env, "webhooks_failed", 24)).toBe(0);
  });
});

describe("averageLatencyMs", () => {
  it("computes sum/count as an approximate average, not a true percentile", async () => {
    const { env } = fakeEnv([{ first: { total: 5000 } }, { first: { total: 10 } }]);
    expect(await averageLatencyMs(env, "admin", 1)).toBe(500);
  });

  it("returns null (not 0 or NaN) when there are zero samples, so callers can render 'no data' honestly", async () => {
    const { env } = fakeEnv([{ first: { total: 0 } }, { first: { total: 0 } }]);
    expect(await averageLatencyMs(env, "admin", 1)).toBeNull();
  });
});

describe("recordTaskRun / getTaskRun", () => {
  it("upserts the task's last run status and detail", async () => {
    const { env, statements } = fakeEnv();
    await recordTaskRun(env, "inventory_reservation_expiry", "ok");
    expect(statements[0]!.sql).toContain("on conflict(task_name) do update");
    expect(statements[0]!.args).toEqual(["inventory_reservation_expiry", "ok", null]);
  });

  it("reads back a stored task run", async () => {
    const { env } = fakeEnv([{ first: { task_name: "inventory_reservation_expiry", last_run_at: "2026-08-15 10:00:00", status: "ok", detail: null } }]);
    const run = await getTaskRun(env, "inventory_reservation_expiry");
    expect(run?.status).toBe("ok");
  });

  it("returns null for a task that has never run", async () => {
    const { env } = fakeEnv([{ first: null }]);
    expect(await getTaskRun(env, "unknown_task")).toBeNull();
  });
});

describe("cleanupOldMetrics", () => {
  it("deletes only buckets older than the retention window and returns the row count removed", async () => {
    const { env, statements } = fakeEnv([{ run: { changes: 42 } }]);
    const deleted = await cleanupOldMetrics(env, 14);
    expect(deleted).toBe(42);
    expect(statements[0]!.sql).toContain("delete from operational_metrics where bucket < ?");
  });
});
