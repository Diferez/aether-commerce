import { CustomerOrderService, type CustomerOrderRepository } from "@aether-commerce/api-core";
import { CURRENT_ORDER_SELECT, orderWithCurrentData, type StoredOrderRow } from "./orders";

/** D1 adapter for customer-scoped order reads. */
export function createCustomerOrderService(db: D1Database): CustomerOrderService {
  const repository: CustomerOrderRepository = {
    async listByUserId(userId) {
      const rows = await db
        .prepare(`select ${CURRENT_ORDER_SELECT} from orders where user_id = ? order by created_at desc`)
        .bind(userId)
        .all<StoredOrderRow>();
      return rows.results.map(orderWithCurrentData);
    },
    async findByIdForUser(userId, orderId) {
      const row = await db
        .prepare(`select ${CURRENT_ORDER_SELECT} from orders where id = ? and user_id = ?`)
        .bind(orderId, userId)
        .first<StoredOrderRow>();
      return row ? orderWithCurrentData(row) : null;
    }
  };
  return new CustomerOrderService(repository);
}
