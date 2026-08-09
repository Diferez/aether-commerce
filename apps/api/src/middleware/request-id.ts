import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../types";

export const requestId = (): MiddlewareHandler<AppBindings> => async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const id = incoming && incoming.length <= 80 ? incoming : crypto.randomUUID();
  c.set("requestId", id);
  c.header("x-request-id", id);
  await next();
};
