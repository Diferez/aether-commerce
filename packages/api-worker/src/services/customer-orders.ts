import { CustomerOrderService, type CustomerOrderRepository } from "@aether/api-core";

/** D1 adapter for customer-scoped order reads. */
export function createCustomerOrderService(db: D1Database): CustomerOrderService {
  const repository: CustomerOrderRepository = {
    async listByUserId(userId) {
      const rows = await db
        .prepare("select payload_json from orders where user_id = ? order by created_at desc")
        .bind(userId)
        .all<{ payload_json: string }>();
      return rows.results.map((row) => JSON.parse(row.payload_json) as Record<string, unknown>);
    },
    async findByIdForUser(userId, orderId) {
      const row = await db
        .prepare("select payload_json from orders where id = ? and user_id = ?")
        .bind(orderId, userId)
        .first<{ payload_json: string }>();
      return row ? JSON.parse(row.payload_json) as Record<string, unknown> : null;
    }
  };
  return new CustomerOrderService(repository);
}
