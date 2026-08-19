import {
  CustomerPreferencesService,
  type CustomerPreferencesRepository
} from "@aether/api-core";

function parseProductIds(value: string | undefined): string[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) && parsed.every((id) => typeof id === "string") ? parsed : [];
}

/** D1 adapter for the reusable customer-preferences service. */
export function createCustomerPreferencesService(db: D1Database): CustomerPreferencesService {
  const repository: CustomerPreferencesRepository = {
    async listFavoriteProductIds(userId) {
      const rows = await db.prepare("select product_id from favorites where user_id = ? order by created_at desc").bind(userId).all<{
        product_id: string;
      }>();
      return rows.results.map((row) => row.product_id);
    },
    async saveFavorite({ id, userId, productId }) {
      await db.prepare("insert or ignore into favorites (id, user_id, product_id) values (?, ?, ?)").bind(id, userId, productId).run();
    },
    async removeFavorite(userId, productId) {
      await db.prepare("delete from favorites where user_id = ? and product_id = ?").bind(userId, productId).run();
    },
    async readComparisonProductIds(userId) {
      const row = await db.prepare("select product_ids_json from product_comparisons where id = ?").bind(userId).first<{
        product_ids_json: string;
      }>();
      return parseProductIds(row?.product_ids_json);
    },
    async writeComparisonProductIds(userId, productIds) {
      await db
        .prepare(
          `insert into product_comparisons (id, user_id, anonymous_id, product_ids_json, created_at, updated_at)
           values (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           on conflict(id) do update set product_ids_json = excluded.product_ids_json, updated_at = CURRENT_TIMESTAMP`
        )
        .bind(userId, userId, null, JSON.stringify(productIds))
        .run();
    }
  };

  return new CustomerPreferencesService(repository, () => crypto.randomUUID());
}
