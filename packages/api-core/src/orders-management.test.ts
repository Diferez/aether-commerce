import { describe, expect, it } from "vitest";
import { OrderManagementService, type OrderManagementRepository } from "./orders";

describe("order management", () => {
  it("records status history before updating persistent state", async () => {
    const calls: string[] = [];
    const repository: OrderManagementRepository = {
      appendStatusHistory: (entry) => {
        calls.push(`${entry.id}:${entry.orderId}:${entry.state}`);
        return Promise.resolve();
      },
      updateOrderState: (orderId, state) => {
        calls.push(`${orderId}:${state}`);
        return Promise.resolve();
      }
    };
    await new OrderManagementService(repository, () => "history").updateStatus({ orderId: "order", state: "shipped", actorId: "admin", requestId: "request" });
    expect(calls).toEqual(["history:order:shipped", "order:shipped"]);
  });
});
