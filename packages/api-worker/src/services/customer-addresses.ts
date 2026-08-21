import { CustomerAddressService, type CustomerAddressRepository } from "@aether-commerce/api-core";

/** D1 adapter for reusable customer address operations. */
export function createCustomerAddressService(db: D1Database): CustomerAddressService {
  const repository: CustomerAddressRepository = {
    async list(userId) {
      const rows = await db.prepare("select payload_json from user_addresses where user_id = ? and deleted_at is null").bind(userId).all<{ payload_json: string }>();
      return rows.results.map((row) => JSON.parse(row.payload_json) as Record<string, unknown> & { id: string });
    },
    async create(userId, address) {
      await db.prepare(
        `insert into user_addresses (id, user_id, label, full_name, country, payload_json, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).bind(address.id, userId, "Default", address.fullName ?? null, address.country ?? null, JSON.stringify(address)).run();
    },
    async update(userId, addressId, patch) {
      await db.prepare("update user_addresses set payload_json = json_patch(payload_json, ?), updated_at = CURRENT_TIMESTAMP where id = ? and user_id = ?")
        .bind(JSON.stringify(patch), addressId, userId).run();
    },
    async softDelete(userId, addressId) {
      await db.prepare("update user_addresses set deleted_at = CURRENT_TIMESTAMP where id = ? and user_id = ?").bind(addressId, userId).run();
    }
  };
  return new CustomerAddressService(repository, () => crypto.randomUUID());
}
