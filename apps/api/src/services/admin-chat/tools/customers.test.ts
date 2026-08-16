import { describe, expect, it } from "vitest";
import { getCustomerDetailsTool, getCustomerOrderHistoryTool, searchCustomersTool } from "./customers";
import { fakeContext, fakeEnv } from "../test-support";

describe("searchCustomersTool", () => {
  it("returns a customer_list artifact built from the roster and order aggregates", async () => {
    const { env } = fakeEnv([
      { first: { count: 1 } },
      {
        all: [
          { id: "usr_1", name: "Ana", email: "ana@example.com", roles_json: '["customer"]', status: "active", created_at: "2026-01-01", source: "registered" }
        ]
      },
      { all: [{ email_key: "ana@example.com", order_count: 3, total_spent: 9000, last_order_at: "2026-02-01" }] }
    ]);
    const ctx = fakeContext(env);

    const result = await searchCustomersTool.run({ query: "ana", pageSize: 10 }, ctx);

    expect(result.artifact).toMatchObject({
      type: "customer_list",
      customers: [{ id: "usr_1", email: "ana@example.com", orderCount: 3, totalSpentCents: 9000, href: "/customers/detail/?id=usr_1" }]
    });
    expect(result.message).toMatch(/found 1 customer/i);
    // Model-facing message must name the customer, not just a count, so a
    // follow-up single-record call can reference it instead of guessing.
    expect(result.message).toContain("ana@example.com");
    expect(result.artifact).toMatchObject({ displayMessage: "Found 1 customer(s)." });
  });

  it("reports no matches without inventing a customer", async () => {
    const { env } = fakeEnv([{ first: { count: 0 } }, { all: [] }]);
    const ctx = fakeContext(env);

    const result = await searchCustomersTool.run({ query: "nobody", pageSize: 10 }, ctx);

    expect(result.artifact).toEqual({ type: "customer_list", customers: [] });
    expect(result.message).toMatch(/no customers matched/i);
  });
});

describe("getCustomerDetailsTool", () => {
  it("returns CUSTOMER_NOT_FOUND for an id with no matching user row", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const result = await getCustomerDetailsTool.run({ customerId: "usr_missing" }, ctx);

    expect(result.artifact).toEqual({ type: "error", code: "CUSTOMER_NOT_FOUND", message: "Customer not found." });
  });

  it("returns a customer_card summarizing status and order count, never raw address/payment data", async () => {
    const { env } = fakeEnv([
      { first: { id: "usr_1", name: "Ana", email: "ana@example.com", roles_json: '["admin"]', status: "active", created_at: "2026-01-01" } },
      { all: [{ payload_json: JSON.stringify({ label: "Home" }) }] },
      { all: [{ payload_json: JSON.stringify({ id: "ord_1", totals: { total: 4200 } }) }] }
    ]);
    const ctx = fakeContext(env);

    const result = await getCustomerDetailsTool.run({ customerId: "usr_1" }, ctx);

    expect(result.artifact).toMatchObject({ type: "customer_card", customer: { id: "usr_1", status: "active", orderCount: 1, totalSpentCents: 4200 } });
    if (result.artifact.type === "customer_card") {
      expect(result.artifact.customer).not.toHaveProperty("shippingAddress");
      expect(result.artifact.customer).not.toHaveProperty("payment");
    }
  });
});

describe("getCustomerOrderHistoryTool", () => {
  it("returns CUSTOMER_NOT_FOUND for an unknown customer", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const result = await getCustomerOrderHistoryTool.run({ customerId: "usr_missing" }, ctx);

    expect(result.artifact).toEqual({ type: "error", code: "CUSTOMER_NOT_FOUND", message: "Customer not found." });
  });

  it("minimizes each order to id/number/status/total - strips shippingAddress and payment metadata", async () => {
    const { env } = fakeEnv([
      { first: { id: "usr_1", name: "Ana", email: "ana@example.com", roles_json: '["customer"]', status: "active", created_at: "2026-01-01" } },
      { all: [] },
      {
        all: [
          {
            payload_json: JSON.stringify({
              id: "ord_1",
              number: "AETH-1",
              state: "completed",
              paymentStatus: "paid",
              fulfillmentStatus: "delivered",
              totals: { total: 5000, currency: "USD" },
              createdAt: "2026-01-05",
              shippingAddress: { line1: "123 Main St" },
              payment: { last4: "4242" }
            })
          }
        ]
      }
    ]);
    const ctx = fakeContext(env);

    const result = await getCustomerOrderHistoryTool.run({ customerId: "usr_1" }, ctx);

    expect(result.artifact).toMatchObject({
      type: "customer_order_history",
      customerId: "usr_1",
      orders: [{ id: "ord_1", number: "AETH-1", fulfillmentStatus: "delivered", totalCents: 5000, currency: "USD" }]
    });
    if (result.artifact.type === "customer_order_history") {
      expect(result.artifact.orders[0]).not.toHaveProperty("shippingAddress");
      expect(result.artifact.orders[0]).not.toHaveProperty("payment");
    }
    // Model-facing message must name the order, not just a count, so a
    // follow-up single-record call can reference it instead of guessing.
    expect(result.message).toContain("AETH-1");
    expect(result.artifact).toMatchObject({ displayMessage: "Ana has 1 order(s)." });
  });

  it("reports no orders yet instead of an empty error", async () => {
    const { env } = fakeEnv([
      { first: { id: "usr_1", name: "Ana", email: "ana@example.com", roles_json: '["customer"]', status: "active", created_at: "2026-01-01" } },
      { all: [] },
      { all: [] }
    ]);
    const ctx = fakeContext(env);

    const result = await getCustomerOrderHistoryTool.run({ customerId: "usr_1" }, ctx);

    expect(result.artifact).toEqual({ type: "customer_order_history", customerId: "usr_1", orders: [] });
    expect(result.message).toMatch(/no orders yet/i);
  });
});
