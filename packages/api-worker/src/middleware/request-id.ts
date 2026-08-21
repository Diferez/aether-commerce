import type { MiddlewareHandler } from "hono";
import { createRequestId } from "@aether-commerce/observability";
import type { AppBindings } from "../types";

// Establishes the one id every log line, audit entry, Sentry event, and
// error response for this request will carry. cf-ray (Cloudflare's own
// per-request edge identifier) is captured separately as traceId - useful
// for cross-referencing Cloudflare's own dashboards, but never used as the
// primary requestId since it isn't present in local/dev requests.
export const requestId = (): MiddlewareHandler<AppBindings> => async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const id = createRequestId(incoming);
  c.set("requestId", id);

  const cfRay = c.req.header("cf-ray");
  if (cfRay) c.set("traceId", cfRay);

  c.header("x-request-id", id);
  await next();
};
