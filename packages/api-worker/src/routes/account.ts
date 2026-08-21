import { Hono } from "hono";
import type { AppBindings } from "../types";
import { collection, fail } from "../http";
import { resolveActorEmail } from "../services/clerk";
import { CURRENT_ORDER_SELECT, orderWithCurrentData, type StoredOrderRow } from "../services/orders";

export const accountRoutes = new Hono<AppBindings>();

accountRoutes.get("/orders", async (c) => {
  const actor = c.get("actor");
  if (!actor.userId) {
    return fail(c, 401, "AUTH_REQUIRED", "Sign in to view orders.");
  }

  const email = await resolveActorEmail(c.env, actor);
  const rows = email
    ? await c.env.DB.prepare(
        `select ${CURRENT_ORDER_SELECT} from orders
         where user_id = ? or email = ? collate nocase
         order by created_at desc`
      )
        .bind(actor.userId, email)
        .all<StoredOrderRow>()
    : await c.env.DB.prepare(`select ${CURRENT_ORDER_SELECT} from orders where user_id = ? order by created_at desc`)
        .bind(actor.userId)
        .all<StoredOrderRow>();

  const data = rows.results.map(orderWithCurrentData);
  return collection(c, data, {
    page: 1,
    pageSize: data.length,
    total: data.length,
    pageCount: data.length > 0 ? 1 : 0
  });
});
