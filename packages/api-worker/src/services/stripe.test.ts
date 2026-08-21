import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { createRefund, verifyStripeSignature } from "./stripe";

// crypto.subtle.timingSafeEqual is a Cloudflare Workers (workerd) extension to
// WebCrypto, not part of Node's implementation - real production traffic runs
// under workerd (confirmed by manually replaying a signed webhook against
// `wrangler dev` and observing a 200), so this only backfills the primitive
// for this Node-based vitest run.
beforeAll(() => {
  if (typeof crypto.subtle.timingSafeEqual !== "function") {
    crypto.subtle.timingSafeEqual = (a: BufferSource, b: BufferSource) => {
      const bufA = a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      const bufB = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      if (bufA.length !== bufB.length) return false;
      let diff = 0;
      for (let i = 0; i < bufA.length; i += 1) diff |= bufA[i]! ^ bufB[i]!;
      return diff === 0;
    };
  }
});

async function sign(secret: string, timestamp: number, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("verifyStripeSignature", () => {
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

  it("accepts a signature computed with the same secret and a fresh timestamp", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const v1 = await sign(secret, timestamp, body);
    expect(await verifyStripeSignature(secret, body, `t=${timestamp},v1=${v1}`)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const v1 = await sign("whsec_other_secret", timestamp, body);
    expect(await verifyStripeSignature(secret, body, `t=${timestamp},v1=${v1}`)).toBe(false);
  });

  it("rejects a signature whose body was tampered with after signing", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const v1 = await sign(secret, timestamp, body);
    const tamperedBody = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", amount_total: 999999 });
    expect(await verifyStripeSignature(secret, tamperedBody, `t=${timestamp},v1=${v1}`)).toBe(false);
  });

  it("rejects a timestamp outside the 5 minute tolerance window", async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 10 * 60;
    const v1 = await sign(secret, staleTimestamp, body);
    expect(await verifyStripeSignature(secret, body, `t=${staleTimestamp},v1=${v1}`)).toBe(false);
  });

  it("rejects a malformed header missing t= or v1=", async () => {
    expect(await verifyStripeSignature(secret, body, "garbage-header")).toBe(false);
    expect(await verifyStripeSignature(secret, body, "t=12345")).toBe(false);
  });
});

describe("createRefund", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when STRIPE_SECRET_KEY is not configured", async () => {
    await expect(createRefund({} as Env, "pi_123")).rejects.toThrow("Stripe secret key is not configured");
  });

  it("posts to the Stripe refunds endpoint with the payment intent and returns the parsed refund", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk_test_123");
      const params = new URLSearchParams(init.body as string);
      expect(params.get("payment_intent")).toBe("pi_123");
      expect(params.get("amount")).toBeNull();
      return Promise.resolve(new Response(JSON.stringify({ id: "re_123", status: "succeeded" }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const refund = await createRefund({ STRIPE_SECRET_KEY: "sk_test_123" } as Env, "pi_123");
    expect(refund).toEqual({ id: "re_123", status: "succeeded" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.stripe.com/v1/refunds", expect.any(Object));
  });

  it("sends a partial amount when amountCents is provided", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const params = new URLSearchParams(init.body as string);
      expect(params.get("amount")).toBe("500");
      return Promise.resolve(new Response(JSON.stringify({ id: "re_456" }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await createRefund({ STRIPE_SECRET_KEY: "sk_test_123" } as Env, "pi_123", 500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws with the Stripe error message when the API call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ error: { message: "No such payment_intent" } }), { status: 400 }))
      )
    );
    // The failure path also increments the payments_failed metric (a D1 write).
    const db = { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })) })) })) };

    await expect(createRefund({ STRIPE_SECRET_KEY: "sk_test_123", DB: db } as unknown as Env, "pi_missing")).rejects.toThrow(
      "No such payment_intent"
    );
  });
});
