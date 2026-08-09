import { Hono } from "hono";
import type { AppBindings } from "../types";
import { collection, fail } from "../http";

export const accountRoutes = new Hono<AppBindings>();

accountRoutes.get("/orders", async (c) => {
  const actor = c.get("actor");
  const customerEmail = c.req.header("x-aether-customer-email")?.trim().toLowerCase();
  if (!actor.userId && !customerEmail) {
    return fail(c, 401, "AUTH_REQUIRED", "Sign in to view orders.");
  }

  const rows = await c.env.DB.prepare(
    actor.userId
      ? "select payload_json from orders where user_id = ? order by created_at desc"
      : "select payload_json from orders where lower(email) = ? order by created_at desc"
  )
    .bind(actor.userId ?? customerEmail)
    .all<{ payload_json: string }>();

  const data: Array<Record<string, unknown>> = rows.results.map(
    (row) => JSON.parse(row.payload_json) as Record<string, unknown>
  );
  return collection(c, data, {
    page: 1,
    pageSize: data.length,
    total: data.length,
    pageCount: data.length > 0 ? 1 : 0
  });
});
