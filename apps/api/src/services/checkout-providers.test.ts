import { describe, expect, it } from "vitest";
import { getStripeSecretKeyStatus, mapStripeSessionToPaidCheckoutSession } from "./stripe";
import { getWompiSecretKeyStatus, mapWompiTransactionToPaidCheckoutSession, verifyWompiSignature } from "./wompi";

describe("stripe adapter", () => {
  it("classifies secret key shapes", () => {
    expect(getStripeSecretKeyStatus(undefined)).toBe("missing");
    expect(getStripeSecretKeyStatus("sk_test_abc")).toBe("test_secret");
    expect(getStripeSecretKeyStatus("sk_live_abc")).toBe("live_secret");
    expect(getStripeSecretKeyStatus("pk_test_abc")).toBe("publishable_key");
  });

  it("maps a Stripe checkout session onto the provider-neutral shape", () => {
    expect(
      mapStripeSessionToPaidCheckoutSession({
        id: "cs_123",
        payment_status: "paid",
        amount_total: 1999,
        currency: "usd",
        customer_details: { email: "buyer@example.com" },
        metadata: { cartId: "cart_1", userId: "user_1" },
        payment_intent: "pi_123"
      })
    ).toEqual({
      id: "cs_123",
      status: "paid",
      amountTotal: 1999,
      currency: "usd",
      customerEmail: "buyer@example.com",
      metadata: { cartId: "cart_1", userId: "user_1" },
      providerReference: "pi_123"
    });
  });

  it("treats a non-paid Stripe session as pending, not failed", () => {
    expect(mapStripeSessionToPaidCheckoutSession({ id: "cs_456", payment_status: "unpaid" }).status).toBe("pending");
  });
});

describe("wompi adapter", () => {
  it("classifies secret key shapes", () => {
    expect(getWompiSecretKeyStatus(undefined)).toBe("missing");
    expect(getWompiSecretKeyStatus("prv_test_abc")).toBe("test_secret");
    expect(getWompiSecretKeyStatus("prv_prod_abc")).toBe("live_secret");
    expect(getWompiSecretKeyStatus("pub_test_abc")).toBe("publishable_key");
  });

  it("maps an approved Wompi transaction onto the provider-neutral shape, decoding cartId/userId from reference", () => {
    expect(
      mapWompiTransactionToPaidCheckoutSession({
        id: "txn_123",
        status: "APPROVED",
        amount_in_cents: 4490000,
        currency: "COP",
        reference: "cart_1::user_1",
        customer_email: "buyer@example.com"
      })
    ).toEqual({
      id: "txn_123",
      status: "paid",
      amountTotal: 4490000,
      currency: "COP",
      customerEmail: "buyer@example.com",
      metadata: { cartId: "cart_1", userId: "user_1" },
      providerReference: "txn_123"
    });
  });

  it("maps every Wompi status onto the provider-neutral vocabulary", () => {
    const statusFor = (status: string) => mapWompiTransactionToPaidCheckoutSession({ id: "txn_1", status }).status;
    expect(statusFor("APPROVED")).toBe("paid");
    expect(statusFor("PENDING")).toBe("pending");
    expect(statusFor("DECLINED")).toBe("failed");
    expect(statusFor("VOIDED")).toBe("failed");
    expect(statusFor("ERROR")).toBe("failed");
    expect(statusFor("SOMETHING_UNDOCUMENTED")).toBe("unknown");
  });

  // Checksum comparison goes through timingSafeEqualText, which calls the
  // Cloudflare Workers-only crypto.subtle.timingSafeEqual extension (same as
  // verifyStripeSignature) - not available under vitest's Node environment,
  // which is why that call path is covered by a static presence check in
  // tests/contracts.test.mjs instead of a runtime unit test here.
  it("rejects a webhook missing signature metadata without needing to compare a checksum", async () => {
    expect(await verifyWompiSignature("events-secret", { event: "transaction.updated" })).toBe(false);
  });
});
