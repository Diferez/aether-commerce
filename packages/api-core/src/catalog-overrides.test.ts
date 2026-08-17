import { describe, expect, it } from "vitest";
import { ProductOverrideService, type ProductOverrideRepository } from "./catalog";

describe("product overrides", () => {
  it("uses a generated id for inserts and a stable id for replacement saves", async () => {
    const ids: string[] = [];
    const repository: ProductOverrideRepository = {
      insert: (input) => {
        ids.push(input.id);
        return Promise.resolve();
      },
      upsert: (input) => {
        ids.push(input.id);
        return Promise.resolve();
      },
      remove: () => Promise.resolve()
    };
    const service = new ProductOverrideService(repository, () => "generated-override");

    await expect(service.create("product-1", { visibility: "hidden" })).resolves.toEqual({ id: "generated-override", productId: "product-1" });
    await expect(service.save("product-1", { visibility: "visible" })).resolves.toEqual({ id: "override_product-1", productId: "product-1", saved: true });
    expect(ids).toEqual(["generated-override", "override_product-1"]);
  });
});
