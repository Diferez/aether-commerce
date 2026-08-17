import { describe, expect, it } from "vitest";
import { createCheckoutReturnUrls, isCheckoutSessionPaid } from "./checkout";

describe("checkout core", () => {
  it("builds app-owned return URLs without a payment-provider dependency", () => {
    expect(
      createCheckoutReturnUrls({
        origin: "https://shop.example/",
        basePath: "/store/",
        cartId: "cart 1",
        successPath: "/checkout/success?checkout=success",
        cancelPath: "/cart?checkout=cancelled"
      })
    ).toEqual({
      successUrl: "https://shop.example/store/checkout/success?checkout=success&cart=cart%201",
      cancelUrl: "https://shop.example/store/cart?checkout=cancelled"
    });
  });

  it("accepts only completed payment sessions", () => {
    expect(isCheckoutSessionPaid({ id: "session_1", payment_status: "paid" })).toBe(true);
    expect(isCheckoutSessionPaid({ id: "session_2", payment_status: "unpaid" })).toBe(false);
  });
});
