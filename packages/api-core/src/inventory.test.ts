import { describe, expect, it } from "vitest";
import { createInventoryAdjustment, InventoryService, type InventoryRepository } from "./inventory";

describe("inventory service", () => {
  it("normalizes signed quantities into explicit audit movement types", () => {
    expect(
      createInventoryAdjustment({ productId: "product", sku: "sku", quantity: -3, actorId: "admin", requestId: "request" }, "movement")
    ).toMatchObject({ type: "adjustment_negative", quantity: 3, reason: null });
  });

  it("records adjustments through the repository port", async () => {
    const movements: unknown[] = [];
    const repository: InventoryRepository = {
      countLowStock: () => Promise.resolve(2),
      listInventory: () => Promise.resolve([]),
      listMovements: () => Promise.resolve([]),
      appendMovement: (movement) => {
        movements.push(movement);
        return Promise.resolve();
      }
    };
    const service = new InventoryService(repository, () => "movement");
    await service.adjust({ productId: "product", sku: "sku", quantity: 5, actorId: "admin", requestId: "request" });
    expect(movements).toHaveLength(1);
    expect(await service.countLowStock()).toBe(2);
  });
});
