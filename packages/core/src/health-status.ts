// Pure rule engine turning a handful of measured signals into the traffic-
// light status the admin panel's "System health" page shows. Kept free of
// any D1/fetch access so it can be unit tested with plain numbers - the
// route handler that calls this is the only place that touches the
// database, this file just decides what the numbers mean.

export type HealthLevel = "operational" | "degraded" | "critical" | "unknown";

export type HealthThresholds = {
  errorRateDegradedPct: number;
  errorRateCriticalPct: number;
  latencyP95DegradedMs: number;
  consecutiveWebhookFailuresCritical: number;
  paidOrderBlockedMinutesCritical: number;
  adminFailedAttemptsDegraded: number;
  staleCriticalTaskMinutesDegraded: number;
};

// Matches Fase 15's suggested starting values - centralized here (not
// scattered across route handlers) so they can be tuned in one place as
// real traffic volume gives a better sense of normal noise.
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  errorRateDegradedPct: 5,
  errorRateCriticalPct: 15,
  latencyP95DegradedMs: 1500,
  consecutiveWebhookFailuresCritical: 3,
  paidOrderBlockedMinutesCritical: 10,
  adminFailedAttemptsDegraded: 5,
  staleCriticalTaskMinutesDegraded: 120
};

export type HealthSignals = {
  errorRatePct: number | null;
  latencyP95Ms: number | null;
  consecutiveWebhookFailures: number;
  paymentSucceededWithoutLocalOrder: boolean;
  negativeInventoryCount: number;
  oldestPaidOrderBlockedMinutes: number | null;
  recentAdminFailedAttempts: number;
  criticalTaskStaleMinutes: number | null;
};

export type ComponentStatus = { level: HealthLevel; reason?: string };

export type SystemHealthResult = {
  level: HealthLevel;
  components: {
    errors: ComponentStatus;
    latency: ComponentStatus;
    webhooks: ComponentStatus;
    orders: ComponentStatus;
    inventory: ComponentStatus;
    security: ComponentStatus;
    scheduledTasks: ComponentStatus;
  };
};

// The overall rollup is the worst *known* signal, defaulting to
// operational - "unknown" only describes an individual component (no
// error-rate baseline yet, a task that's never run once) and is rendered
// as its own gray badge there. It deliberately does NOT drag the headline
// status down: a signal this system has no way to measure yet (see
// routes/admin.ts's system-health handler - errorRatePct has no request-
// volume denominator to compute a true rate from) would otherwise pin the
// whole dashboard gray forever, which is worse than the false-positive
// risk it was meant to avoid.
function worstLevel(levels: HealthLevel[]): HealthLevel {
  if (levels.includes("critical")) return "critical";
  if (levels.includes("degraded")) return "degraded";
  return "operational";
}

export function evaluateSystemHealth(signals: HealthSignals, thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS): SystemHealthResult {
  const errors: ComponentStatus =
    signals.errorRatePct === null
      ? { level: "unknown" }
      : signals.errorRatePct > thresholds.errorRateCriticalPct
        ? { level: "critical", reason: `Error rate ${signals.errorRatePct.toFixed(1)}% exceeds ${thresholds.errorRateCriticalPct}%` }
        : signals.errorRatePct > thresholds.errorRateDegradedPct
          ? { level: "degraded", reason: `Error rate ${signals.errorRatePct.toFixed(1)}% exceeds ${thresholds.errorRateDegradedPct}%` }
          : { level: "operational" };

  const latency: ComponentStatus =
    signals.latencyP95Ms === null
      ? { level: "unknown" }
      : signals.latencyP95Ms > thresholds.latencyP95DegradedMs
        ? { level: "degraded", reason: `p95 latency ${Math.round(signals.latencyP95Ms)}ms exceeds ${thresholds.latencyP95DegradedMs}ms` }
        : { level: "operational" };

  const webhooks: ComponentStatus =
    signals.consecutiveWebhookFailures >= thresholds.consecutiveWebhookFailuresCritical
      ? { level: "critical", reason: `${signals.consecutiveWebhookFailures} consecutive webhook failures` }
      : signals.consecutiveWebhookFailures > 0
        ? { level: "degraded", reason: `${signals.consecutiveWebhookFailures} recent webhook failure(s)` }
        : { level: "operational" };

  const orders: ComponentStatus = signals.paymentSucceededWithoutLocalOrder
    ? { level: "critical", reason: "A successful payment has no matching local order" }
    : signals.oldestPaidOrderBlockedMinutes !== null && signals.oldestPaidOrderBlockedMinutes > thresholds.paidOrderBlockedMinutesCritical
      ? { level: "critical", reason: `A paid order has been blocked for ${signals.oldestPaidOrderBlockedMinutes} minute(s)` }
      : { level: "operational" };

  const inventory: ComponentStatus =
    signals.negativeInventoryCount > 0
      ? { level: "critical", reason: `${signals.negativeInventoryCount} product(s) with negative stock` }
      : { level: "operational" };

  const security: ComponentStatus =
    signals.recentAdminFailedAttempts >= thresholds.adminFailedAttemptsDegraded
      ? { level: "degraded", reason: `${signals.recentAdminFailedAttempts} failed admin attempt(s) recently` }
      : { level: "operational" };

  const scheduledTasks: ComponentStatus =
    signals.criticalTaskStaleMinutes !== null && signals.criticalTaskStaleMinutes > thresholds.staleCriticalTaskMinutesDegraded
      ? { level: "degraded", reason: `A critical task has not run in ${signals.criticalTaskStaleMinutes} minute(s)` }
      : { level: "operational" };

  const components = { errors, latency, webhooks, orders, inventory, security, scheduledTasks };
  return { level: worstLevel(Object.values(components).map((component) => component.level)), components };
}
