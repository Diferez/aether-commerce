import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { classifyError, OBSERVABILITY_EVENTS } from "@aether/core";
import type { AppBindings } from "../types";
import { fail } from "../http";
import { captureException, getLogger } from "../services/observability";
import { incrementMetric } from "../services/metrics";

function normalizeStatus(status: number) {
  return [400, 401, 403, 404, 409, 422, 429, 500, 502, 503].includes(status)
    ? (status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503)
    : 500;
}

// This MUST be registered via app.onError(errorBoundary()), never as a
// app.use("*", ...) middleware with its own try/catch around next(). Hono's
// compose() intercepts a thrown error at the innermost dispatch level using
// the app's own errorHandler (this function, once registered) before it can
// ever bubble up to an outer middleware's try/catch - a middleware-shaped
// version of this function would silently never run. See errors.test.ts for
// the empirical proof (and index.ts for the correct registration).
//
// The single catch-all for anything a route/service throws. Every path
// through this function: gets a structured log line (100% of the time,
// unsampled - this is the "error" level, never dropped), reports to Sentry
// only when the error is classified as unexpected/reportable (so routine
// validation failures and permission denials don't spam the error tracker),
// and always returns the safe {code, message, requestId} shape - a stack
// trace never reaches the response body.
export const errorBoundary = (): ErrorHandler<AppBindings> => (error, c) => {
  const logger = getLogger(c.env);
  const requestId = c.get("requestId");
  const traceId = c.get("traceId");
  const route = new URL(c.req.url).pathname;
  const method = c.req.method;

  if (error instanceof HTTPException) {
    logger.warn(OBSERVABILITY_EVENTS.applicationUnhandledError, {
      requestId,
      traceId,
      route,
      method,
      statusCode: error.status,
      errorName: "HTTPException",
      errorMessage: error.message
    });
    return Promise.resolve(fail(c, normalizeStatus(error.status), "HTTP_ERROR", error.message));
  }

  const classified = classifyError(error);
  logger.error(OBSERVABILITY_EVENTS.applicationUnhandledError, {
    requestId,
    traceId,
    route,
    method,
    statusCode: classified.statusCode,
    errorCode: classified.code,
    error
  });

  if (classified.reportable) {
    captureException(c.env, error, { requestId, traceId, route, method, code: classified.code });
  }
  // Fire-and-forget - "System health" reads this back as an absolute count
  // (see routes/health.ts's own comment on why this isn't a true error
  // *rate*: total request volume isn't tracked, so there's no denominator).
  c.executionCtx.waitUntil(incrementMetric(c.env, "application_errors").catch(() => {}));

  return Promise.resolve(fail(c, classified.statusCode, classified.code, classified.userMessage));
};
