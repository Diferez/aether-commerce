import { CouponService, type CouponRepository } from "@aether-commerce/api-core";

/** D1 adapter for coupon administration. */
export function createCouponService(db: D1Database): CouponService {
  const repository: CouponRepository = {
    async list() {
      const rows = await db.prepare("select * from coupons").all<Record<string, unknown>>();
      return rows.results;
    },
    async upsert(input) {
      await db
        .prepare("insert or replace into coupons (code, type, value, active, minimum_subtotal) values (?, ?, ?, 1, 0)")
        .bind(input.code, input.type, input.value)
        .run();
    },
    async deactivate(code) {
      await db.prepare("update coupons set active = 0 where code = ?").bind(code).run();
    }
  };
  return new CouponService(repository);
}
