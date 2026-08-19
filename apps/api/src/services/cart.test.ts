import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { applyCoupon, InvalidCouponError } from "./cart";

beforeEach(() => {
  vi.clearAllMocks();
});

type QueuedResponse = { first?: unknown; all?: unknown[] };

function fakeEnv(responses: QueuedResponse[] = []) {
  let callIndex = 0;
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const response = responses[callIndex] ?? {};
      callIndex += 1;
      return {
        bind: vi.fn((...args: unknown[]) => {
          statements.push({ sql, args });
          return {
            first: vi.fn(() => Promise.resolve(response.first ?? null)),
            all: vi.fn(() => Promise.resolve({ results: response.all ?? [] })),
            run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } }))
          };
        }),
        first: vi.fn(() => Promise.resolve(response.first ?? null)),
        all: vi.fn(() => Promise.resolve({ results: response.all ?? [] })),
        run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } }))
      };
    })
  };
  return { env: { DB: db } as unknown as Env, db, statements };
}

function emptyCartRow() {
  return { payload_json: JSON.stringify({ id: "cart_1", items: [], totals: { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0 } }) };
}

describe("applyCoupon", () => {
  it("throws InvalidCouponError when no coupon row exists for the code", async () => {
    const { env } = fakeEnv([{ first: null }]);
    await expect(applyCoupon(env, "cart_1", "NOPE")).rejects.toThrow(InvalidCouponError);
  });

  it("throws InvalidCouponError for a deactivated coupon, even with the right code", async () => {
    const { env } = fakeEnv([{ first: { code: "AETHER10", type: "percentage", value: 10, active: 0, minimum_subtotal: 0, starts_at: null, ends_at: null } }]);
    await expect(applyCoupon(env, "cart_1", "aether10")).rejects.toThrow(InvalidCouponError);
  });

  it("throws InvalidCouponError for a coupon that hasn't started yet", async () => {
    const { env } = fakeEnv([
      {
        first: {
          code: "FUTURE",
          type: "fixed",
          value: 500,
          active: 1,
          minimum_subtotal: 0,
          starts_at: new Date(Date.now() + 86_400_000).toISOString(),
          ends_at: null
        }
      }
    ]);
    await expect(applyCoupon(env, "cart_1", "FUTURE")).rejects.toThrow(InvalidCouponError);
  });

  it("throws InvalidCouponError for a coupon past its end date", async () => {
    const { env } = fakeEnv([
      {
        first: {
          code: "EXPIRED",
          type: "fixed",
          value: 500,
          active: 1,
          minimum_subtotal: 0,
          starts_at: null,
          ends_at: new Date(Date.now() - 86_400_000).toISOString()
        }
      }
    ]);
    await expect(applyCoupon(env, "cart_1", "EXPIRED")).rejects.toThrow(InvalidCouponError);
  });

  it("applies a real, active coupon and persists its code on the cart, normalized to uppercase", async () => {
    const { env, statements } = fakeEnv([
      { first: { code: "WELCOME10", type: "percentage", value: 10, active: 1, minimum_subtotal: 0, starts_at: null, ends_at: null } },
      { first: emptyCartRow() },
      { first: null }, // shipping settings read -> disabled/not configured
      {} // writeCart upsert
    ]);

    const cart = await applyCoupon(env, "cart_1", "welcome10");

    expect(cart.couponCode).toBe("WELCOME10");
    const upsert = statements.find((s) => s.sql.includes("insert into carts"));
    expect(upsert?.args[3]).toEqual(expect.stringContaining("\"couponCode\":\"WELCOME10\""));
  });
});
