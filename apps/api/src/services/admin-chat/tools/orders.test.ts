import { describe, expect, it } from "vitest";
import {
  getAllowedOrderTransitionsTool,
  getOrderDetailsTool,
  getOrderTimelineTool,
  getOrdersByStatusTool,
  getPendingOrdersTool,
  searchOrdersTool
} from "./orders";
import { fakeContext, fakeEnv } from "../test-support";

const ORDER_ROW = {
  id: "ord_1",
  number: "AETH-1",
  email: "ana@example.com",
  state: "completed",
  payment_status: "paid",
  fulfillment_status: "unfulfilled",
  total: 5000,
  currency: "USD",
  created_at: "2026-08-15T09:00:00Z"
};

describe("searchOrdersTool", () => {
  it("returns an order_list artifact for matches", async () => {
    const { env } = fakeEnv([{ first: { count: 1 } }, { all: [ORDER_ROW] }]);
    const ctx = fakeContext(env);

    const result = await searchOrdersTool.run({ query: "AETH-1", pageSize: 10 }, ctx);

    expect(result.artifact).toMatchObject({
      type: "order_list",
      orders: [{ id: "ord_1", number: "AETH-1", totalCents: 5000, fulfillmentStatus: "unfulfilled", href: "/orders/detail/?id=ord_1" }]
    });
  });

  it("reports no matches without inventing an order", async () => {
    const { env } = fakeEnv([{ first: { count: 0 } }, { all: [] }]);
    const ctx = fakeContext(env);

    const result = await searchOrdersTool.run({ query: "nonexistent", pageSize: 10 }, ctx);

    expect(result.artifact).toEqual({ type: "order_list", orders: [] });
  });
});

describe("getOrdersByStatusTool", () => {
  it("filters to exactly the requested fulfillment status", async () => {
    const { env, db } = fakeEnv([{ first: { count: 1 } }, { all: [ORDER_ROW] }]);
    const ctx = fakeContext(env);

    const result = await getOrdersByStatusTool.run({ fulfillmentStatus: "unfulfilled", pageSize: 10 }, ctx);

    expect(result.artifact).toMatchObject({ type: "order_list", orders: [{ id: "ord_1" }] });
    expect(db.prepare.mock.calls[1]![0]).toContain("fulfillment_status = ?");
  });
});

describe("getPendingOrdersTool", () => {
  it("lists unfulfilled orders as pending", async () => {
    const { env } = fakeEnv([{ first: { count: 1 } }, { all: [ORDER_ROW] }]);
    const ctx = fakeContext(env);

    const result = await getPendingOrdersTool.run({ pageSize: 10 }, ctx);

    expect(result.message).toMatch(/1 order\(s\) are pending fulfillment/i);
  });

  it("reports no pending orders", async () => {
    const { env } = fakeEnv([{ first: { count: 0 } }, { all: [] }]);
    const ctx = fakeContext(env);

    const result = await getPendingOrdersTool.run({ pageSize: 10 }, ctx);

    expect(result.message).toMatch(/no pending orders right now/i);
  });
});

describe("getOrderDetailsTool", () => {
  it("returns ORDER_NOT_FOUND for an unknown id or number", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const result = await getOrderDetailsTool.run({ orderId: "AETH-999" }, ctx);

    expect(result.artifact).toEqual({ type: "error", code: "ORDER_NOT_FOUND", message: "Order not found." });
  });

  it("includes internal notes and item count in the order_detail artifact", async () => {
    const { env } = fakeEnv([{ first: { ...ORDER_ROW, internal_notes: "Fragile - handle with care" } }, { first: { count: 3 } }]);
    const ctx = fakeContext(env);

    const result = await getOrderDetailsTool.run({ orderId: "ord_1" }, ctx);

    expect(result.artifact).toMatchObject({
      type: "order_detail",
      order: { id: "ord_1", internalNotes: "Fragile - handle with care", itemCount: 3 }
    });
  });
});

describe("getOrderTimelineTool", () => {
  it("returns ORDER_NOT_FOUND for an unknown order", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const result = await getOrderTimelineTool.run({ orderId: "AETH-999" }, ctx);

    expect(result.artifact).toEqual({ type: "error", code: "ORDER_NOT_FOUND", message: "Order not found." });
  });

  it("maps status-history rows to activity items in chronological order", async () => {
    const { env } = fakeEnv([
      { first: ORDER_ROW },
      {
        all: [
          { id: "hist_1", previous_state: null, new_state: "processing", actor_id: "usr_admin", reason: null, created_at: "2026-08-14T09:00:00Z" },
          { id: "hist_2", previous_state: "processing", new_state: "shipped", actor_id: "usr_admin", reason: null, created_at: "2026-08-15T09:00:00Z" }
        ]
      }
    ]);
    const ctx = fakeContext(env);

    const result = await getOrderTimelineTool.run({ orderId: "ord_1" }, ctx);

    expect(result.artifact).toEqual({
      type: "activity_list",
      items: [
        { id: "hist_1", action: "processing", targetType: "order", targetId: "ord_1", actorId: "usr_admin", createdAt: "2026-08-14T09:00:00Z" },
        { id: "hist_2", action: "processing -> shipped", targetType: "order", targetId: "ord_1", actorId: "usr_admin", createdAt: "2026-08-15T09:00:00Z" }
      ]
    });
  });

  it("reports no status history yet", async () => {
    const { env } = fakeEnv([{ first: ORDER_ROW }, { all: [] }]);
    const ctx = fakeContext(env);

    const result = await getOrderTimelineTool.run({ orderId: "ord_1" }, ctx);

    expect(result.message).toMatch(/no status history yet/i);
  });
});

describe("getAllowedOrderTransitionsTool", () => {
  it("returns ORDER_NOT_FOUND for an unknown order", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const result = await getAllowedOrderTransitionsTool.run({ orderId: "AETH-999" }, ctx);

    expect(result.artifact).toEqual({ type: "error", code: "ORDER_NOT_FOUND", message: "Order not found." });
  });

  it("lists only the transitions the fulfillment state machine actually allows from the current status", async () => {
    const { env } = fakeEnv([{ first: { ...ORDER_ROW, fulfillment_status: "processing" } }]);
    const ctx = fakeContext(env);

    const result = await getAllowedOrderTransitionsTool.run({ orderId: "ord_1" }, ctx);

    expect(result.artifact).toMatchObject({ type: "allowed_transitions", current: "processing" });
    if (result.artifact.type === "allowed_transitions") {
      expect(result.artifact.allowed).not.toContain("processing");
    }
  });

  it("reports a terminal order cannot move to any other status", async () => {
    const { env } = fakeEnv([{ first: { ...ORDER_ROW, fulfillment_status: "delivered" } }]);
    const ctx = fakeContext(env);

    const result = await getAllowedOrderTransitionsTool.run({ orderId: "ord_1" }, ctx);

    expect(result.artifact).toEqual({ type: "allowed_transitions", current: "delivered", allowed: [] });
    expect(result.message).toMatch(/cannot move to any other status/i);
  });
});
