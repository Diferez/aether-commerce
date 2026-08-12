import { describe, expect, it } from "vitest";
import { assertOrderTransition, canTransitionOrder } from "./order-state";

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
