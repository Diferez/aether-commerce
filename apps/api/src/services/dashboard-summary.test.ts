import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { computeDashboardSummary } from "./dashboard-summary";

type QueuedResponse = { first?: unknown };

function fakeEnv(responses: QueuedResponse[] = []) {
  let callIndex = 0;
  const db = {
    prepare: vi.fn(() => {
      const response = responses[callIndex] ?? {};
      callIndex += 1;
      return { first: vi.fn(() => Promise.resolve(response.first ?? null)) };
    })
  };
  return { env: { DB: db } as unknown as Env, db };
}

describe("computeDashboardSummary", () => {
  it("sums revenue and counts orders that actually collected money, alongside a real low-stock count", async () => {
    const { env } = fakeEnv([{ first: { revenue: 543200, orders: 12 } }, { first: { count: 4 } }]);

    const summary = await computeDashboardSummary(env);

    expect(summary).toEqual({ revenue: 543200, orders: 12, conversionRate: 4.8, lowStock: 4 });
  });

  it("defaults every real figure to zero when the queries return nothing", async () => {
    const { env } = fakeEnv([{ first: null }, { first: null }]);

    const summary = await computeDashboardSummary(env);

    expect(summary).toEqual({ revenue: 0, orders: 0, conversionRate: 4.8, lowStock: 0 });
  });
});
