import { describe, expect, it } from "vitest";
import { CouponService, type CouponRepository } from "./coupons";

describe("coupon administration", () => {
  it("normalizes coupon codes before persistence and deactivation", async () => {
    const storedCodes: string[] = [];
    const repository: CouponRepository = {
      list: () => Promise.resolve([]),
      upsert: (input) => {
        storedCodes.push(input.code);
        return Promise.resolve();
      },
      deactivate: (code) => {
        storedCodes.push(code);
        return Promise.resolve();
      }
    };
    const service = new CouponService(repository);

    await expect(service.create({ code: " welcome ", type: "percent", value: 10 })).resolves.toEqual({ code: "WELCOME" });
    await expect(service.deactivate("welcome")).resolves.toBeUndefined();
    expect(storedCodes).toEqual(["WELCOME", "WELCOME"]);
  });
});
