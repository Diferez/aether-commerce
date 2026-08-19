import { describe, expect, it } from "vitest";
import { executeCreateCoupon, executeDeactivateCoupon, listCouponsTool, prepareCreateCouponTool, prepareDeactivateCouponTool } from "./coupons";
import { fakeContext, fakeEnv } from "../test-support";

describe("listCouponsTool", () => {
  it("summarizes how many coupons exist and how many are active", async () => {
    const { env } = fakeEnv([{ all: [{ code: "A", active: 1 }, { code: "B", active: 0 }, { code: "C", active: 1 }] }]);
    const ctx = fakeContext(env);

    const result = await listCouponsTool.run({}, ctx);

    expect(result.message).toMatch(/3 coupon\(s\), 2 active/);
    expect(result.artifact).toMatchObject({ summary: { coupons: 3, active: 2 } });
  });

  it("reports no coupons yet when the table is empty", async () => {
    const { env } = fakeEnv([{ all: [] }]);
    const ctx = fakeContext(env);

    const result = await listCouponsTool.run({}, ctx);

    expect(result.message).toMatch(/no coupons yet/i);
  });
});

describe("prepareCreateCouponTool", () => {
  it("prepares a pending action without writing anything yet", async () => {
    const { env, db } = fakeEnv([
      { first: null }, // createPendingAction: no existing pending row
      {}, // insert
      { first: { id: "pact_1", expires_at: new Date(Date.now() + 300_000).toISOString() } } // read back
    ]);
    const ctx = fakeContext(env);

    const result = await prepareCreateCouponTool.run({ code: "welcome10", type: "percentage", value: 10, minimumSubtotal: 0 }, ctx);

    expect(result.artifact).toMatchObject({ type: "pending_action", operationId: "pact_1", toolName: "prepare_create_coupon" });
    expect(db.prepare).toHaveBeenCalledTimes(3);
  });

  it("normalizes the code to uppercase in the preview", async () => {
    const { env } = fakeEnv([
      { first: null },
      {},
      { first: { id: "pact_1", expires_at: new Date(Date.now() + 300_000).toISOString() } }
    ]);
    const ctx = fakeContext(env);

    const result = await prepareCreateCouponTool.run({ code: "welcome10", type: "fixed", value: 500, minimumSubtotal: 0 }, ctx);

    expect(result.artifact).toMatchObject({ diff: { targetLabel: "WELCOME10" } });
  });
});

describe("executeCreateCoupon", () => {
  it("inserts the coupon active and writes an audit log entry", async () => {
    const { env, db, statements } = fakeEnv([{}, {}]);
    const ctx = fakeContext(env);

    const outcome = await executeCreateCoupon(ctx, { code: "WELCOME10", type: "percentage", value: 10, minimumSubtotal: 0 });

    expect(outcome).toEqual({ success: true, result: { code: "WELCOME10" } });
    const insert = statements.find((s) => s.sql.includes("insert or replace into coupons"));
    expect(insert?.args).toEqual(["WELCOME10", "percentage", 10, 0]);
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });
});

describe("prepareDeactivateCouponTool", () => {
  it("reports COUPON_NOT_FOUND without creating a pending action for an unknown code", async () => {
    const { env, db } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const result = await prepareDeactivateCouponTool.run({ code: "NOPE" }, ctx);

    expect(result.artifact).toMatchObject({ type: "error", code: "COUPON_NOT_FOUND" });
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it("short-circuits without a pending action when the coupon is already inactive", async () => {
    const { env, db } = fakeEnv([{ first: { code: "OLD10", type: "percentage", value: 10, active: 0, minimum_subtotal: 0 } }]);
    const ctx = fakeContext(env);

    const result = await prepareDeactivateCouponTool.run({ code: "OLD10" }, ctx);

    expect(result.message).toMatch(/already inactive/i);
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it("prepares a pending action for an active coupon", async () => {
    const { env } = fakeEnv([
      { first: { code: "WELCOME10", type: "percentage", value: 10, active: 1, minimum_subtotal: 0 } },
      { first: null },
      {},
      { first: { id: "pact_1", expires_at: new Date(Date.now() + 300_000).toISOString() } }
    ]);
    const ctx = fakeContext(env);

    const result = await prepareDeactivateCouponTool.run({ code: "WELCOME10" }, ctx);

    expect(result.artifact).toMatchObject({ type: "pending_action", operationId: "pact_1", toolName: "prepare_deactivate_coupon" });
  });
});

describe("executeDeactivateCoupon", () => {
  it("deactivates the coupon and writes an audit log entry", async () => {
    const { env, db } = fakeEnv([{ run: { changes: 1 } }, {}]);
    const ctx = fakeContext(env);

    const outcome = await executeDeactivateCoupon(ctx, { code: "WELCOME10" });

    expect(outcome).toEqual({ success: true, result: { code: "WELCOME10", active: false } });
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });

  it("fails without writing an audit log when the coupon was already inactive by the time this ran", async () => {
    const { env, db } = fakeEnv([{ run: { changes: 0 } }]);
    const ctx = fakeContext(env);

    const outcome = await executeDeactivateCoupon(ctx, { code: "WELCOME10" });

    expect(outcome).toMatchObject({ success: false, code: "COUPON_ALREADY_INACTIVE" });
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });
});
