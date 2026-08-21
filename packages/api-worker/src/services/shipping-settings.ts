import { ShippingSettingsService, type ShippingSettingsRepository } from "@aether/api-core";

/** D1 adapter for persisted shipping configuration. */
export function createShippingSettingsService(db: D1Database): ShippingSettingsService {
  const repository: ShippingSettingsRepository = {
    async read() {
      const row = await db.prepare("select value_json from application_settings where key = 'shipping'").first<{ value_json: string }>();
      return row ? JSON.parse(row.value_json) as Record<string, unknown> : null;
    }
  };
  return new ShippingSettingsService(repository);
}
