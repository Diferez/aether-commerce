import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../types";

// Deliberately permissive about characters (covers UUIDs, ULIDs, and
// whatever format an upstream proxy or client SDK generates) but bounded in
// length - a client-supplied id is never trusted blindly, just accepted if
// it's shaped like a real correlation id and replaced with a fresh UUID
// otherwise.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

function isValidIncomingRequestId(value: string | undefined | null): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

// Establishes the one id every log line, audit entry, Sentry event, and
// error response for this request will carry. cf-ray (Cloudflare's own
// per-request edge identifier) is captured separately as traceId - useful
// for cross-referencing Cloudflare's own dashboards, but never used as the
// primary requestId since it isn't present in local/dev requests.
export const requestId = (): MiddlewareHandler<AppBindings> => async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const id = isValidIncomingRequestId(incoming) ? incoming : crypto.randomUUID();
  c.set("requestId", id);

  const cfRay = c.req.header("cf-ray");
  if (cfRay) c.set("traceId", cfRay);

  c.header("x-request-id", id);
  await next();
};
