import { Hono } from "hono";
import type { AppBindings } from "../types";
import { collection, fail } from "../http";
import { resolveActorEmail } from "../services/clerk";

export const accountRoutes = new Hono<AppBindings>();

accountRoutes.get("/orders", async (c) => {
  const actor = c.get("actor");
  if (!actor.userId) {
    return fail(c, 401, "AUTH_REQUIRED", "Sign in to view orders.");
  }

  const email = await resolveActorEmail(c.env, actor);
  const rows = email
    ? await c.env.DB.prepare(
        `select payload_json from orders
         where user_id = ? or email = ? collate nocase
         order by created_at desc`
      )
        .bind(actor.userId, email)
        .all<{ payload_json: string }>()
    : await c.env.DB.prepare("select payload_json from orders where user_id = ? order by created_at desc")
        .bind(actor.userId)
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
