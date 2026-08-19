import { describe, expect, it } from "vitest";
import { AdminOrderReadService, type AdminOrderReadRepository } from "./orders";

describe("admin order reads", () => {
  it("uses a repository port for summaries and order detail lookup", async () => {
    const repository: AdminOrderReadRepository = {
      listRecent: () => Promise.resolve([{ id: "order-1", state: "paid" }]),
      findById: (orderId) => Promise.resolve(orderId === "order-1" ? { id: orderId, state: "paid" } : null)
    };
    const service = new AdminOrderReadService(repository);

    await expect(service.listRecent()).resolves.toEqual([{ id: "order-1", state: "paid" }]);
    await expect(service.find("missing")).resolves.toBeNull();
  });
});
