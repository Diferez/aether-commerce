import { Hono } from "hono";
import type { AppBindings } from "../types";
import { collection, fail } from "../http";
import { createCustomerOrderService } from "../services/customer-orders";

export const accountRoutes = new Hono<AppBindings>();

accountRoutes.get("/orders", async (c) => {
  const actor = c.get("actor");
  if (!actor.userId) {
    return fail(c, 401, "AUTH_REQUIRED", "Sign in to view orders.");
  }

  const data = await createCustomerOrderService(c.env.DB).list(actor.userId);
  return collection(c, data, {
    page: 1,
    pageSize: data.length,
    total: data.length,
    pageCount: data.length > 0 ? 1 : 0
  });
});
