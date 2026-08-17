import {
  AdminOrderReadService,
  OrderManagementService,
  type AdminOrderReadRepository,
  type OrderManagementRepository
} from "@aether/api-core";

/** D1 adapter for reusable order administration operations. */
export function createOrderManagementService(db: D1Database): OrderManagementService {
  const repository: OrderManagementRepository = {
    async appendStatusHistory(entry) {
      await db
        .prepare("insert into order_status_history (id, order_id, previous_state, new_state, actor_id, reason, request_id) values (?, ?, null, ?, ?, ?, ?)")
        .bind(entry.id, entry.orderId, entry.state, entry.actorId, entry.reason ?? null, entry.requestId)
        .run();
    },
    async updateOrderState(orderId, state) {
      await db.prepare("update orders set state = ?, updated_at = CURRENT_TIMESTAMP where id = ?").bind(state, orderId).run();
    }
  };
  return new OrderManagementService(repository, () => crypto.randomUUID());
}

/** D1 adapter for administrative order lists and detail reads. */
export function createAdminOrderReadService(db: D1Database): AdminOrderReadService {
  const repository: AdminOrderReadRepository = {
    async listRecent() {
      const rows = await db
        .prepare("select id, number, email, state, total, currency, created_at from orders order by created_at desc limit 100")
        .all<Record<string, unknown>>();
      return rows.results;
    },
    async findById(orderId) {
      const row = await db.prepare("select payload_json from orders where id = ?").bind(orderId).first<{ payload_json: string }>();
      return row ? JSON.parse(row.payload_json) as Record<string, unknown> : null;
    }
  };
  return new AdminOrderReadService(repository);
}
