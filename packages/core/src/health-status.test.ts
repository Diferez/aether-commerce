import { describe, expect, it } from "vitest";
import { DEFAULT_HEALTH_THRESHOLDS, evaluateSystemHealth, formatDurationMinutes, type HealthSignals } from "./health-status";

const HEALTHY_SIGNALS: HealthSignals = {
  errorRatePct: 0,
  latencyP95Ms: 200,
  consecutiveWebhookFailures: 0,
  paymentSucceededWithoutLocalOrder: false,
  negativeInventoryCount: 0,
  oldestPaidOrderBlockedMinutes: null,
  recentAdminFailedAttempts: 0,
  criticalTaskStaleMinutes: null
};

describe("evaluateSystemHealth", () => {
  it("reports fully operational when every signal is clean", () => {
    const result = evaluateSystemHealth(HEALTHY_SIGNALS);
    expect(result.level).toBe("operational");
    expect(Object.values(result.components).every((c) => c.level === "operational")).toBe(true);
  });

  it("marks error rate and latency unknown when there is no data yet, without dragging the overall status down", () => {
    const result = evaluateSystemHealth({ ...HEALTHY_SIGNALS, errorRatePct: null, latencyP95Ms: null });
    expect(result.components.errors.level).toBe("unknown");
    expect(result.components.latency.level).toBe("unknown");
    // A signal the system can't measure yet must never itself pin the
    // headline status gray forever - see worstLevel's own comment.
    expect(result.level).toBe("operational");
  });

  it("degrades on an error rate just above the degraded threshold", () => {
    const result = evaluateSystemHealth({ ...HEALTHY_SIGNALS, errorRatePct: DEFAULT_HEALTH_THRESHOLDS.errorRateDegradedPct + 0.1 });
    expect(result.components.errors.level).toBe("degraded");
    expect(result.level).toBe("degraded");
  });

  it("goes critical on an error rate above the critical threshold", () => {
    const result = evaluateSystemHealth({ ...HEALTHY_SIGNALS, errorRatePct: DEFAULT_HEALTH_THRESHOLDS.errorRateCriticalPct + 1 });
    expect(result.components.errors.level).toBe("critical");
    expect(result.level).toBe("critical");
  });

  it("degrades on p95 latency above threshold", () => {
    const result = evaluateSystemHealth({ ...HEALTHY_SIGNALS, latencyP95Ms: DEFAULT_HEALTH_THRESHOLDS.latencyP95DegradedMs + 1 });
    expect(result.components.latency.level).toBe("degraded");
  });

  it("goes critical at exactly the configured number of consecutive webhook failures", () => {
    const result = evaluateSystemHealth({
      ...HEALTHY_SIGNALS,
      consecutiveWebhookFailures: DEFAULT_HEALTH_THRESHOLDS.consecutiveWebhookFailuresCritical
    });
    expect(result.components.webhooks.level).toBe("critical");
  });

  it("only degrades (not critical) for webhook failures below the critical count", () => {
    const result = evaluateSystemHealth({ ...HEALTHY_SIGNALS, consecutiveWebhookFailures: 1 });
    expect(result.components.webhooks.level).toBe("degraded");
  });

  it("goes critical when a payment succeeded with no matching local order", () => {
    const result = evaluateSystemHealth({ ...HEALTHY_SIGNALS, paymentSucceededWithoutLocalOrder: true });
    expect(result.components.orders.level).toBe("critical");
    expect(result.level).toBe("critical");
  });

  it("goes critical when a paid order has been blocked past the critical threshold", () => {
    const result = evaluateSystemHealth({
      ...HEALTHY_SIGNALS,
      oldestPaidOrderBlockedMinutes: DEFAULT_HEALTH_THRESHOLDS.paidOrderBlockedMinutesCritical + 1
    });
    expect(result.components.orders.level).toBe("critical");
  });

  it("only degrades (not critical) for a blocked order between the two thresholds", () => {
    const result = evaluateSystemHealth({
      ...HEALTHY_SIGNALS,
      oldestPaidOrderBlockedMinutes: DEFAULT_HEALTH_THRESHOLDS.paidOrderBlockedMinutesDegraded + 1
    });
    expect(result.components.orders.level).toBe("degraded");
  });

  it("stays operational for an order still well within normal manual-fulfillment latency (regression guard for the 10-minute-default incident)", () => {
    // A 2-hour-old paid order in a manually-fulfilled store is normal, not
    // an incident - this is the class of false positive the original
    // 10-minute default produced (it would have already flagged this as
    // critical).
    const result = evaluateSystemHealth({ ...HEALTHY_SIGNALS, oldestPaidOrderBlockedMinutes: 120 });
    expect(result.components.orders.level).toBe("operational");
  });

  it("goes critical on any negative inventory count", () => {
    const result = evaluateSystemHealth({ ...HEALTHY_SIGNALS, negativeInventoryCount: 1 });
    expect(result.components.inventory.level).toBe("critical");
  });

  it("degrades on repeated failed admin attempts", () => {
    const result = evaluateSystemHealth({ ...HEALTHY_SIGNALS, recentAdminFailedAttempts: DEFAULT_HEALTH_THRESHOLDS.adminFailedAttemptsDegraded });
    expect(result.components.security.level).toBe("degraded");
  });

  it("degrades when a critical scheduled task has gone stale", () => {
    const result = evaluateSystemHealth({
      ...HEALTHY_SIGNALS,
      criticalTaskStaleMinutes: DEFAULT_HEALTH_THRESHOLDS.staleCriticalTaskMinutesDegraded + 1
    });
    expect(result.components.scheduledTasks.level).toBe("degraded");
  });

  it("rolls up to the single worst component level across the whole system", () => {
    const result = evaluateSystemHealth({ ...HEALTHY_SIGNALS, negativeInventoryCount: 2, recentAdminFailedAttempts: 999 });
    expect(result.level).toBe("critical");
  });

  it("respects custom thresholds instead of only the defaults", () => {
    const strict = { ...DEFAULT_HEALTH_THRESHOLDS, errorRateDegradedPct: 1 };
    const result = evaluateSystemHealth({ ...HEALTHY_SIGNALS, errorRatePct: 2 }, strict);
    expect(result.components.errors.level).toBe("degraded");
  });

  it("renders the blocked-order reason in a human-readable duration, not raw minutes", () => {
    const result = evaluateSystemHealth({ ...HEALTHY_SIGNALS, oldestPaidOrderBlockedMinutes: 45416 });
    expect(result.components.orders.reason).toContain("day(s)");
    expect(result.components.orders.reason).not.toContain("45416 minute");
  });
});

describe("formatDurationMinutes", () => {
  it("renders minutes under an hour as minutes", () => {
    expect(formatDurationMinutes(45)).toBe("45 minute(s)");
  });

  it("renders under a day as hours", () => {
    expect(formatDurationMinutes(180)).toBe("3 hour(s)");
  });

  it("renders a day or more as days", () => {
    expect(formatDurationMinutes(45416)).toBe("31.5 day(s)");
  });
});
