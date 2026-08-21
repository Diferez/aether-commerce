import { CustomerProfileService, type CustomerProfileRepository } from "@aether/api-core";

/** D1 adapter for the customer profile upsert used by authenticated routes. */
export function createCustomerProfileService(db: D1Database): CustomerProfileService {
  const repository: CustomerProfileRepository = {
    async upsert(input) {
      await db
        .prepare(
          `insert into users (id, clerk_id, email, name, roles_json, created_at, updated_at)
           values (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           on conflict(id) do update set name = excluded.name, updated_at = CURRENT_TIMESTAMP`
        )
        .bind(input.userId, input.userId, input.email, input.name ?? null, JSON.stringify(input.roles))
        .run();
    }
  };
  return new CustomerProfileService(repository);
}
