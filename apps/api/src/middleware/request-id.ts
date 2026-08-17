import type { MiddlewareHandler } from "hono";
import { createRequestId } from "@aether/observability";
import type { AppBindings } from "../types";

export const requestId = (): MiddlewareHandler<AppBindings> => async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const id = createRequestId(incoming);
  c.set("requestId", id);
  c.header("x-request-id", id);
  await next();
};
