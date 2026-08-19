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
  paidOrderBlockedMinutesDegraded: number;
  paidOrderBlockedMinutesCritical: number;
  adminFailedAttemptsDegraded: number;
  staleCriticalTaskMinutesDegraded: number;
};

// Matches Fase 15's suggested starting values, with one deliberate
// deviation: paidOrderBlockedMinutesCritical. The spec's own suggested
// value (10 minutes) assumes an automated fulfillment pipeline that packs
// and ships within minutes of payment. Tested against this store's real
// production data, it flagged a month-old Stripe test-mode order as
// critical on day one - correct in the literal sense (it genuinely is a
// paid, unfulfilled order) but useless as a signal, since EVERY order in a
// manually-fulfilled store sits well past 10 minutes as a matter of
// course. Raised to a two-tier signal (6h degraded, 48h critical) that
// still catches a genuinely stuck order without paging on normal
// operating latency - see docs/observability.md for the incident this
// came from.
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  errorRateDegradedPct: 5,
  errorRateCriticalPct: 15,
  latencyP95DegradedMs: 1500,
  consecutiveWebhookFailuresCritical: 3,
  paidOrderBlockedMinutesDegraded: 360,
  paidOrderBlockedMinutesCritical: 2880,
  adminFailedAttemptsDegraded: 5,
  staleCriticalTaskMinutesDegraded: 120
};

// "45416 minute(s)" means nothing to a human at a glance - render the
// largest sensible unit instead.
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minute(s)`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hour(s)`;
  return `${(minutes / 1440).toFixed(1)} day(s)`;
}

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
      ? { level: "critical", reason: `A paid order has been unfulfilled for ${formatDurationMinutes(signals.oldestPaidOrderBlockedMinutes)}` }
      : signals.oldestPaidOrderBlockedMinutes !== null && signals.oldestPaidOrderBlockedMinutes > thresholds.paidOrderBlockedMinutesDegraded
        ? { level: "degraded", reason: `A paid order has been unfulfilled for ${formatDurationMinutes(signals.oldestPaidOrderBlockedMinutes)}` }
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
