import { describe, expect, it } from "vitest";
import { CustomerOrderService, type CustomerOrder, type CustomerOrderRepository } from "./orders";

describe("customer orders", () => {
  it("scopes lists and detail reads to the owning customer through the repository port", async () => {
    const orders: Array<CustomerOrder & { id: string; userId: string }> = [
      { id: "order-1", userId: "customer-1", state: "paid" },
      { id: "order-2", userId: "customer-2", state: "paid" }
    ];
    const repository: CustomerOrderRepository = {
      listByUserId: (userId) => Promise.resolve(orders.filter((order) => order.userId === userId)),
      findByIdForUser: (userId, orderId) => Promise.resolve(orders.find((order) => order.userId === userId && order.id === orderId) ?? null)
    };
    const service = new CustomerOrderService(repository);

    expect(await service.list("customer-1")).toEqual([{ id: "order-1", userId: "customer-1", state: "paid" }]);
    expect(await service.find("customer-1", "order-2")).toBeNull();
    expect(await service.find("customer-1", "order-1")).toMatchObject({ id: "order-1" });
  });
});
