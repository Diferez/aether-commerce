import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { createConsoleLogger, normalizeErrorStatus } from "@aether/observability";
import type { AppBindings } from "../types";
import { fail } from "../http";

const logger = createConsoleLogger();

export const errorBoundary = (): MiddlewareHandler<AppBindings> => async (c, next) => {
  try {
    await next();
  } catch (error) {
    if (error instanceof HTTPException) {
      return fail(c, normalizeErrorStatus(error.status), "HTTP_ERROR", error.message);
    }

    logger.error("Unhandled API error", {
      requestId: c.get("requestId"),
      error
    });

    return fail(c, 500, "INTERNAL_ERROR", "The request could not be completed.");
  }
};
