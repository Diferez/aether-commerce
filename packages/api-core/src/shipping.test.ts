import { describe, expect, it } from "vitest";
import { ShippingSettingsService, type ShippingSettingsRepository } from "./shipping";

describe("shipping settings", () => {
  it("uses an implementation-owned fallback only when no persisted setting exists", async () => {
    const repository: ShippingSettingsRepository = { read: () => Promise.resolve(null) };
    await expect(new ShippingSettingsService(repository).get({ flatRate: 10 })).resolves.toEqual({ flatRate: 10 });
  });
});
