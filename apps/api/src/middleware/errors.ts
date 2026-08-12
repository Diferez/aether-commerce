import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppBindings } from "../types";
import { fail } from "../http";

function normalizeStatus(status: number) {
  return [400, 401, 403, 404, 409, 422, 429, 500, 503].includes(status)
    ? (status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503)
    : 500;
}

export const errorBoundary = (): MiddlewareHandler<AppBindings> => async (c, next) => {
  try {
    await next();
  } catch (error) {
    if (error instanceof HTTPException) {
      return fail(c, normalizeStatus(error.status), "HTTP_ERROR", error.message);
    }

    console.error("Unhandled API error", {
      requestId: c.get("requestId"),
      error
    });

    return fail(c, 500, "INTERNAL_ERROR", "The request could not be completed.");
  }
};
