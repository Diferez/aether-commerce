import { describe, expect, it, vi } from "vitest";
import { executeRefundOrder, prepareRefundOrderTool } from "./refunds";
import { fakeContext, fakeEnv } from "../test-support";
import type * as RefundsModule from "../../refunds";

vi.mock("../../refunds", async () => {
  const actual = await vi.importActual<typeof RefundsModule>("../../refunds");
  return { ...actual, createProviderRefund: vi.fn() };
});
vi.mock("../../inventory", () => ({ buildRestockStatements: vi.fn(() => Promise.resolve([])) }));
vi.mock("../../catalog", () => ({ clearCatalogCache: vi.fn(() => Promise.resolve()) }));

function stripeOrderRow(overrides: Partial<{ channel: string; payment_status: string; payload_json: string; total: number; stock_restored_at: string | null }> = {}) {
  return {
    channel: "stripe",
    payment_status: "paid",
    payload_json: JSON.stringify({ payment: { providerPaymentIntentId: "pi_123" } }),
    total: 5000,
    stock_restored_at: null,
    ...overrides
  };
}

describe("prepareRefundOrderTool", () => {
  it("reports ORDER_NOT_FOUND without creating a pending action for an unknown order", async () => {
    const { env, db } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const result = await prepareRefundOrderTool.run({ orderId: "ord_missing" }, ctx);

    expect(result.artifact).toMatchObject({ type: "error", code: "ORDER_NOT_FOUND" });
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it("refuses an order from a channel with no payment-provider refund path (e.g. whatsapp) without creating a pending action", async () => {
    const { env, db } = fakeEnv([{ first: { id: "ord_1", ...stripeOrderRow({ channel: "whatsapp" }) } }]);
    const ctx = fakeContext(env);

    const result = await prepareRefundOrderTool.run({ orderId: "ord_1" }, ctx);

    expect(result.artifact).toMatchObject({ type: "error", code: "REFUND_NOT_APPLICABLE" });
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it("refuses an order with no payment intent to refund", async () => {
    const { env } = fakeEnv([{ first: { id: "ord_1", ...stripeOrderRow({ payload_json: "{}" }) } }]);
    const ctx = fakeContext(env);

    const result = await prepareRefundOrderTool.run({ orderId: "ord_1" }, ctx);

    expect(result.artifact).toMatchObject({ type: "error", code: "REFUND_MISSING_PAYMENT_INTENT" });
  });

  it("prepares a pending action for a refundable Stripe order", async () => {
    const { env } = fakeEnv([
      { first: { id: "ord_1", ...stripeOrderRow() } },
      { first: null },
      {},
      { first: { id: "pact_1", expires_at: new Date(Date.now() + 300_000).toISOString() } }
    ]);
    const ctx = fakeContext(env);

    const result = await prepareRefundOrderTool.run({ orderId: "ord_1" }, ctx);

    expect(result.artifact).toMatchObject({ type: "pending_action", operationId: "pact_1", toolName: "prepare_refund_order" });
  });

  it("prepares a pending action for a refundable Wompi order", async () => {
    const { env } = fakeEnv([
      { first: { id: "ord_1", ...stripeOrderRow({ channel: "wompi", payload_json: JSON.stringify({ payment: { providerPaymentIntentId: "txn_123" } }) }) } },
      { first: null },
      {},
      { first: { id: "pact_1", expires_at: new Date(Date.now() + 300_000).toISOString() } }
    ]);
    const ctx = fakeContext(env);

    const result = await prepareRefundOrderTool.run({ orderId: "ord_1" }, ctx);

    expect(result.artifact).toMatchObject({ type: "pending_action", operationId: "pact_1", toolName: "prepare_refund_order" });
  });
});

describe("executeRefundOrder", () => {
  it("re-validates the order's current state and refuses if it's no longer refundable", async () => {
    const { env } = fakeEnv([{ first: stripeOrderRow({ payment_status: "refunded" }) }]);
    const ctx = fakeContext(env);

    const outcome = await executeRefundOrder(ctx, { orderId: "ord_1" });

    expect(outcome).toMatchObject({ success: false, code: "REFUND_NOT_APPLICABLE" });
  });

  it("calls the payment provider, marks the order refunded, restocks, and writes an audit log entry on a full refund", async () => {
    const refunds = await import("../../refunds");
    vi.mocked(refunds.createProviderRefund).mockResolvedValueOnce({ id: "re_123" });
    const { env, db } = fakeEnv([{ first: stripeOrderRow() }]);
    // batch() default mock in test-support resolves without meta.changes,
    // which executeRefundOrder never inspects (unlike changeOrderState) -
    // this executor trusts the WHERE clause, same as the real REST route.
    const ctx = fakeContext(env);

    const outcome = await executeRefundOrder(ctx, { orderId: "ord_1" });

    expect(outcome).toEqual({ success: true, result: { orderId: "ord_1", paymentStatus: "refunded", providerRefundId: "re_123" } });
    expect(db.batch).toHaveBeenCalledTimes(1);
  });

  it("marks the order partially_refunded (no restock) when the amount is less than the order total", async () => {
    const refunds = await import("../../refunds");
    vi.mocked(refunds.createProviderRefund).mockResolvedValueOnce({ id: "re_456" });
    const { env } = fakeEnv([{ first: stripeOrderRow({ total: 5000 }) }]);
    const ctx = fakeContext(env);

    const outcome = await executeRefundOrder(ctx, { orderId: "ord_1", amountCents: 1000 });

    expect(outcome).toEqual({ success: true, result: { orderId: "ord_1", paymentStatus: "partially_refunded", providerRefundId: "re_456" } });
  });

  it("refunds a Wompi order through the same executor", async () => {
    const refunds = await import("../../refunds");
    vi.mocked(refunds.createProviderRefund).mockResolvedValueOnce({ id: "txn_123", status: "VOIDED" });
    const { env } = fakeEnv([
      { first: stripeOrderRow({ channel: "wompi", payload_json: JSON.stringify({ payment: { providerPaymentIntentId: "txn_123" } }) }) }
    ]);
    const ctx = fakeContext(env);

    const outcome = await executeRefundOrder(ctx, { orderId: "ord_1" });

    expect(outcome).toEqual({ success: true, result: { orderId: "ord_1", paymentStatus: "refunded", providerRefundId: "txn_123" } });
    expect(refunds.createProviderRefund).toHaveBeenCalledWith(env, "wompi", "txn_123", undefined, 5000);
  });

  it("returns REFUND_FAILED without writing anything when the payment provider rejects the refund", async () => {
    const refunds = await import("../../refunds");
    vi.mocked(refunds.createProviderRefund).mockRejectedValueOnce(new Error("card_not_refundable"));
    const { env, db } = fakeEnv([{ first: stripeOrderRow() }]);
    const ctx = fakeContext(env);

    const outcome = await executeRefundOrder(ctx, { orderId: "ord_1" });

    expect(outcome).toEqual({ success: false, code: "REFUND_FAILED", message: "card_not_refundable" });
    expect(db.batch).not.toHaveBeenCalled();
  });
});
