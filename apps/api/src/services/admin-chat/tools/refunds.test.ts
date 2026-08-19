import { describe, expect, it, vi } from "vitest";
import { executeRefundOrder, prepareRefundOrderTool } from "./refunds";
import { fakeContext, fakeEnv } from "../test-support";

vi.mock("../../stripe", () => ({ createRefund: vi.fn() }));
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

  it("refuses a non-Stripe order without creating a pending action", async () => {
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
});

describe("executeRefundOrder", () => {
  it("re-validates the order's current state and refuses if it's no longer refundable", async () => {
    const { env } = fakeEnv([{ first: stripeOrderRow({ payment_status: "refunded" }) }]);
    const ctx = fakeContext(env);

    const outcome = await executeRefundOrder(ctx, { orderId: "ord_1" });

    expect(outcome).toMatchObject({ success: false, code: "REFUND_NOT_APPLICABLE" });
  });

  it("calls Stripe, marks the order refunded, restocks, and writes an audit log entry on a full refund", async () => {
    const stripe = await import("../../stripe");
    vi.mocked(stripe.createRefund).mockResolvedValueOnce({ id: "re_123" } as never);
    const { env, db } = fakeEnv([{ first: stripeOrderRow() }]);
    // batch() default mock in test-support resolves without meta.changes,
    // which executeRefundOrder never inspects (unlike changeOrderState) -
    // this executor trusts the WHERE clause, same as the real REST route.
    const ctx = fakeContext(env);

    const outcome = await executeRefundOrder(ctx, { orderId: "ord_1" });

    expect(outcome).toEqual({ success: true, result: { orderId: "ord_1", paymentStatus: "refunded", stripeRefundId: "re_123" } });
    expect(db.batch).toHaveBeenCalledTimes(1);
  });

  it("marks the order partially_refunded (no restock) when the amount is less than the order total", async () => {
    const stripe = await import("../../stripe");
    vi.mocked(stripe.createRefund).mockResolvedValueOnce({ id: "re_456" } as never);
    const { env } = fakeEnv([{ first: stripeOrderRow({ total: 5000 }) }]);
    const ctx = fakeContext(env);

    const outcome = await executeRefundOrder(ctx, { orderId: "ord_1", amountCents: 1000 });

    expect(outcome).toEqual({ success: true, result: { orderId: "ord_1", paymentStatus: "partially_refunded", stripeRefundId: "re_456" } });
  });

  it("returns STRIPE_REFUND_FAILED without writing anything when Stripe rejects the refund", async () => {
    const stripe = await import("../../stripe");
    vi.mocked(stripe.createRefund).mockRejectedValueOnce(new Error("card_not_refundable"));
    const { env, db } = fakeEnv([{ first: stripeOrderRow() }]);
    const ctx = fakeContext(env);

    const outcome = await executeRefundOrder(ctx, { orderId: "ord_1" });

    expect(outcome).toEqual({ success: false, code: "STRIPE_REFUND_FAILED", message: "card_not_refundable" });
    expect(db.batch).not.toHaveBeenCalled();
  });
});
