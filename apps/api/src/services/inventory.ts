import { InventoryService, type InventoryRepository } from "@aether/api-core";

/** D1 persistence adapter for reusable inventory operations. */
export function createInventoryService(db: D1Database): InventoryService {
  const repository: InventoryRepository = {
    async countLowStock() {
      const row = await db.prepare("select count(*) as count from inventory where available <= low_stock_threshold").first<{ count: number }>();
      return row?.count ?? 0;
    },
    async listInventory() {
      const rows = await db.prepare("select * from inventory order by updated_at desc limit 100").all<Record<string, unknown>>();
      return rows.results;
    },
    async listMovements() {
      const rows = await db.prepare("select * from inventory_movements order by created_at desc limit 100").all<Record<string, unknown>>();
      return rows.results;
    },
    async appendMovement(movement) {
      await db
        .prepare("insert into inventory_movements (id, product_id, sku, type, quantity, reason, actor_id, request_id) values (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(
          movement.id,
          movement.productId,
          movement.sku,
          movement.type,
          movement.quantity,
          movement.reason,
          movement.actorId,
          movement.requestId
        )
        .run();
    }
  };
  return new InventoryService(repository, () => crypto.randomUUID());
}
