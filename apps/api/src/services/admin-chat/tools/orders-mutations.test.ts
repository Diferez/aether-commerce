import { describe, expect, it } from "vitest";
import { executeOrderStatusChange, prepareOrderStatusChangeTool } from "./orders-mutations";
import { fakeContext, fakeEnv } from "../test-support";

describe("prepareOrderStatusChangeTool", () => {
  it("refuses an order transition the fulfillment state machine does not allow, and explains the real options instead of creating a pending action", async () => {
    const { env, db } = fakeEnv([{ first: { id: "ord_1", number: "AETH-1", fulfillment_status: "delivered", stock_restored_at: null } }]);
    const ctx = fakeContext(env);

    const result = await prepareOrderStatusChangeTool.run({ orderId: "ord_1", fulfillmentStatus: "processing" }, ctx);

    expect(result.artifact).toMatchObject({ type: "allowed_transitions", current: "delivered", allowed: [] });
    expect(result.message).toMatch(/cannot move to any other status/i);
    // Only the read happened - no pending action row was ever inserted.
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it("prepares a pending action for a legal transition", async () => {
    const { env } = fakeEnv([
      { first: { id: "ord_1", number: "AETH-1", fulfillment_status: "processing", stock_restored_at: null } },
      { first: null }, // createPendingAction: no existing pending row
      {}, // insert
      { first: { id: "pact_1", expires_at: new Date(Date.now() + 300_000).toISOString() } } // read back
    ]);
    const ctx = fakeContext(env);

    const result = await prepareOrderStatusChangeTool.run({ orderId: "ord_1", fulfillmentStatus: "shipped" }, ctx);

    expect(result.artifact).toMatchObject({ type: "pending_action", operationId: "pact_1", toolName: "prepare_order_status_change" });
  });
});

describe("executeOrderStatusChange", () => {
  it("re-validates against the order's CURRENT status and refuses if it changed since the preview was shown", async () => {
    // The order moved to "delivered" (terminal) after the preview was
    // generated for a "processing" -> "shipped" transition.
    const { env } = fakeEnv([{ first: { fulfillment_status: "delivered", stock_restored_at: null } }]);
    const ctx = fakeContext(env);

    const outcome = await executeOrderStatusChange(ctx, { orderId: "ord_1", fulfillmentStatus: "shipped" });

    expect(outcome).toMatchObject({ success: false, code: "FULFILLMENT_TRANSITION_INVALID" });
  });

  it("executes the transition and writes an audit log entry when the order state still matches", async () => {
    const { env, db } = fakeEnv([
      { first: { fulfillment_status: "processing", stock_restored_at: null } }, // re-validate
      { run: { changes: 1 } }, // update ... where fulfillment_status = 'processing'
      {} // writeAuditLog insert
    ]);
    const ctx = fakeContext(env);

    const outcome = await executeOrderStatusChange(ctx, { orderId: "ord_1", fulfillmentStatus: "shipped" });

    expect(outcome).toEqual({ success: true, result: { orderId: "ord_1", previousFulfillmentStatus: "processing", fulfillmentStatus: "shipped" } });
    expect(db.prepare).toHaveBeenCalledTimes(3);
  });
});
