import { describe, expect, it } from "vitest";
import {
  assertOrderTransition,
  canTransitionFulfillment,
  canTransitionOrder,
  canTransitionPayment
} from "./order-state";

describe("order state transitions", () => {
  it("allows only declared forward transitions", () => {
    expect(canTransitionOrder("paid", "processing")).toBe(true);
    expect(canTransitionOrder("processing", "packed")).toBe(true);
    expect(canTransitionOrder("delivered", "closed")).toBe(true);
  });

  it("rejects skipped, repeated, and terminal transitions", () => {
    expect(canTransitionOrder("paid", "shipped")).toBe(false);
    expect(canTransitionOrder("processing", "processing")).toBe(false);
    expect(canTransitionOrder("cancelled", "paid")).toBe(false);
    expect(() => assertOrderTransition("paid", "shipped")).toThrow("Invalid order transition");
  });
});

describe("fulfillment status transitions", () => {
  it("allows the declared forward path", () => {
    expect(canTransitionFulfillment("unfulfilled", "processing")).toBe(true);
    expect(canTransitionFulfillment("processing", "shipped")).toBe(true);
    expect(canTransitionFulfillment("shipped", "delivered")).toBe(true);
  });

  it("allows cancelling from unfulfilled or processing but not later", () => {
    expect(canTransitionFulfillment("unfulfilled", "cancelled")).toBe(true);
    expect(canTransitionFulfillment("processing", "cancelled")).toBe(true);
    expect(canTransitionFulfillment("shipped", "cancelled")).toBe(false);
  });

  it("rejects skips and treats delivered/cancelled as terminal", () => {
    expect(canTransitionFulfillment("unfulfilled", "shipped")).toBe(false);
    expect(canTransitionFulfillment("delivered", "processing")).toBe(false);
    expect(canTransitionFulfillment("cancelled", "processing")).toBe(false);
  });
});

describe("payment status transitions", () => {
  it("allows pending to move to paid or failed, and failed back to pending", () => {
    expect(canTransitionPayment("pending", "paid")).toBe(true);
    expect(canTransitionPayment("pending", "failed")).toBe(true);
    expect(canTransitionPayment("failed", "pending")).toBe(true);
  });

  it("allows paid to move to a refund state but not back to pending", () => {
    expect(canTransitionPayment("paid", "refunded")).toBe(true);
    expect(canTransitionPayment("paid", "partially_refunded")).toBe(true);
    expect(canTransitionPayment("paid", "pending")).toBe(false);
  });

  it("treats refunded as terminal and only allows partially_refunded to finish refunding", () => {
    expect(canTransitionPayment("refunded", "paid")).toBe(false);
    expect(canTransitionPayment("partially_refunded", "refunded")).toBe(true);
    expect(canTransitionPayment("partially_refunded", "paid")).toBe(false);
  });
});
