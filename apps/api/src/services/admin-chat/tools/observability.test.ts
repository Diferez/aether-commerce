import { describe, expect, it } from "vitest";
import { getSystemHealthTool, getWebhookActivityTool } from "./observability";
import { fakeContext, fakeEnv } from "../test-support";

describe("getSystemHealthTool", () => {
  it("reports operational with no issues when every signal is clean", async () => {
    const { env } = fakeEnv([
      { all: [] }, // recent webhook statuses
      { all: [] }, // blocked paid order rows
      { first: { count: 0 } }, // blocked order count
      { first: { count: 0 } } // negative inventory count
      // averageLatencyMs -> sumMetric x2, getTaskRun, sumMetric x4 all default to null/0 via fakeEnv's fallback
    ]);
    const ctx = fakeContext(env);

    const result = await getSystemHealthTool.run({}, ctx);

    expect(result.artifact).toMatchObject({ type: "dashboard_summary", summary: { status: "operational" } });
    expect(result.message).toContain("System status: operational");
    expect(result.message).not.toContain("component(s) need attention");
  });

  it("explains the concrete reason for a flagged component instead of a generic description", async () => {
    const { env } = fakeEnv([
      { all: [] }, // recent webhook statuses
      {
        all: [
          {
            id: "ord_blocked_1",
            number: "AETH-A1IMHHNRFA",
            email: "diegomxxx@gmail.com",
            state: "paid",
            total: 26978,
            currency: "USD",
            payment_status: "paid",
            fulfillment_status: "unfulfilled",
            created_at: "2026-07-15 10:08:19"
          }
        ]
      }, // blocked paid order rows
      { first: { count: 1 } }, // blocked order count
      { first: { count: 0 } } // negative inventory count
    ]);
    const ctx = fakeContext(env);

    const result = await getSystemHealthTool.run({}, ctx);

    expect(result.artifact).toMatchObject({
      type: "dashboard_summary",
      summary: { status: "critical", blockedOrdersCount: 1 },
      issues: [{ name: "orders", level: "critical" }],
      relatedOrders: [{ id: "ord_blocked_1", number: "AETH-A1IMHHNRFA" }]
    });
    expect(result.message).toContain("orders (critical)");
    expect(result.message).toContain("unfulfilled for");
    expect(result.message).toContain("AETH-A1IMHHNRFA");
    // Never the raw, unreadable minute count.
    expect(result.message).not.toMatch(/\d{4,} minute/);
  });
});

describe("getWebhookActivityTool", () => {
  it("summarizes failed webhooks with their actual error, not a placeholder", async () => {
    const { env } = fakeEnv([
      {
        all: [
          {
            provider: "stripe",
            provider_event_id: "evt_1",
            status: "failed",
            attempts: 2,
            error_code: "WEBHOOK_PROCESSING_FAILED",
            error_message: "D1 write failed",
            request_id: "req_1",
            received_at: "2026-08-15 10:00:00",
            processed_at: null
          }
        ]
      }
    ]);
    const ctx = fakeContext(env);

    const result = await getWebhookActivityTool.run({ limit: 20 }, ctx);

    expect(result.message).toContain("1 failed");
    expect(result.message).toContain("D1 write failed");
    expect(result.message).toContain("2 attempt(s)");
    expect(result.artifact).toMatchObject({ type: "activity_list", items: [{ id: "evt_1", action: "stripe.failed", targetType: "webhook" }] });
  });

  it("reports no failures cleanly when every recent delivery processed", async () => {
    const { env } = fakeEnv([
      { all: [{ provider: "clerk", provider_event_id: "msg_1", status: "processed", attempts: 1, error_code: null, error_message: null, request_id: "req_1", received_at: "2026-08-15 10:00:00", processed_at: "2026-08-15 10:00:01" }] }
    ]);
    const ctx = fakeContext(env);

    const result = await getWebhookActivityTool.run({ limit: 20 }, ctx);

    expect(result.message).toContain("none failed");
  });

  it("denies a caller without audit.read, matching GET /admin/system-health's own permission", async () => {
    const { env } = fakeEnv([]);
    const ctx = fakeContext(env, { roles: ["customer"], permissions: [] });

    const result = await getWebhookActivityTool.run({ limit: 20 }, ctx);

    expect(result.artifact).toMatchObject({ type: "error", code: "FORBIDDEN" });
  });
});
