import * as Sentry from "@sentry/cloudflare";
import { createLogger, redact, type Logger, type LogLevel } from "@aether/core";
import type { Env } from "../types";

function resolveLogLevel(env: Env): LogLevel {
  if (env.LOG_LEVEL === "debug" || env.LOG_LEVEL === "info" || env.LOG_LEVEL === "warn" || env.LOG_LEVEL === "error") {
    return env.LOG_LEVEL;
  }
  return env.AETHER_ENV === "production" ? "info" : "debug";
}

// One logger per call, configured from env vars read at request time -
// env bindings aren't available at module load in a Worker, only via the
// Hono context, so this can't be a module-level singleton the way it might
// be in a long-lived Node process. Building it is cheap (no I/O), so a
// fresh instance per call is fine.
export function getLogger(env: Env): Logger {
  return createLogger({
    level: resolveLogLevel(env),
    environment: env.AETHER_ENV ?? "development",
    service: "aether-api",
    infoSampleRate: env.LOG_INFO_SAMPLE_RATE !== undefined ? Number(env.LOG_INFO_SAMPLE_RATE) : env.AETHER_ENV === "production" ? 0.1 : 1
  });
}

function isSentryEnabled(env: Env): boolean {
  return env.SENTRY_ENABLED === "true" && Boolean(env.SENTRY_DSN);
}

function redactBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  if (breadcrumb.data) breadcrumb.data = redact(breadcrumb.data) as Record<string, unknown>;
  return breadcrumb;
}

// Last line of defense before anything leaves the process for Sentry: even
// though call sites should never hand secrets/PII to Sentry in the first
// place, this guarantees it regardless of what a future call site does.
function redactSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) event.request.headers = redact(event.request.headers) as Record<string, string>;
  }
  if (event.extra) event.extra = redact(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = redact(event.contexts) as typeof event.contexts;
  if (event.user) {
    if (event.user.id) event.user = { id: event.user.id };
    else delete event.user;
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(redactBreadcrumb);
  return event;
}

// The options callback @sentry/cloudflare's withSentry() calls per-request
// with the real env bindings - returning undefined skips initializing a
// client entirely (no network attempt, no cost) whenever Sentry isn't
// explicitly turned on for this environment.
export function buildSentryOptions(env: Env): Sentry.CloudflareOptions | undefined {
  if (!isSentryEnabled(env)) return undefined;
  return {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.AETHER_ENV ?? "development",
    release: env.SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: env.PERFORMANCE_SAMPLE_RATE !== undefined ? Number(env.PERFORMANCE_SAMPLE_RATE) : 0.05,
    beforeSend: (event) => redactSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => redactBreadcrumb(breadcrumb)
  };
}

export type ErrorReportContext = {
  requestId?: string | undefined;
  traceId?: string | undefined;
  route?: string | undefined;
  method?: string | undefined;
  code?: string | undefined;
  storeId?: string | undefined;
};

// Reports one exception with request-correlating tags. Only called for
// AppError.reportable === true (or classifyError's unexpected default) -
// expected errors (validation, 401, 404, permission denials) never reach
// here, see middleware/errors.ts.
export function captureException(env: Env, error: unknown, context: ErrorReportContext = {}): void {
  if (!isSentryEnabled(env)) return;
  Sentry.withScope((scope) => {
    scope.setTag("service", "aether-api");
    if (context.requestId) scope.setTag("requestId", context.requestId);
    if (context.traceId) scope.setTag("traceId", context.traceId);
    if (context.route) scope.setTag("route", context.route);
    if (context.method) scope.setTag("method", context.method);
    if (context.code) scope.setTag("errorCode", context.code);
    if (context.storeId) scope.setTag("storeId", context.storeId);
    Sentry.captureException(error);
  });
}
