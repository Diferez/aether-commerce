import { OrderManagementService, type OrderManagementRepository } from "@aether/api-core";

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
