import { ProductOverrideService, type ProductOverrideRepository } from "@aether/api-core";

/** D1 adapter for administrative catalog overrides. */
export function createProductOverrideService(db: D1Database): ProductOverrideService {
  const repository: ProductOverrideRepository = {
    async insert(input) {
      await db
        .prepare(
          `insert into product_overrides (id, product_id, payload_json, created_at, updated_at)
           values (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        )
        .bind(input.id, input.productId, JSON.stringify(input.override))
        .run();
    },
    async upsert(input) {
      await db
        .prepare(
          `insert into product_overrides (id, product_id, payload_json, created_at, updated_at)
           values (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           on conflict(id) do update set payload_json = excluded.payload_json, updated_at = CURRENT_TIMESTAMP`
        )
        .bind(input.id, input.productId, JSON.stringify(input.override))
        .run();
    },
    async remove(productId) {
      await db.prepare("delete from product_overrides where product_id = ?").bind(productId).run();
    }
  };
  return new ProductOverrideService(repository, () => crypto.randomUUID());
}
