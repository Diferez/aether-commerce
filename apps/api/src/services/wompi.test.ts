import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { createWompiRefund } from "./wompi";

describe("createWompiRefund", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when WOMPI_SECRET_KEY is not configured", async () => {
    await expect(createWompiRefund({} as Env, "txn_123", undefined, 1000)).rejects.toThrow(
      "Wompi secret key is not configured"
    );
  });

  it("rejects a partial amount - Wompi only supports voiding the full transaction", async () => {
    await expect(
      createWompiRefund({ WOMPI_SECRET_KEY: "prv_test_123" } as Env, "txn_123", 500, 1000)
    ).rejects.toThrow("Wompi only supports full refunds");
  });

  it("voids the full transaction and returns the parsed refund", async () => {
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      expect(url).toBe("https://sandbox.wompi.co/v1/transactions/txn_123/void");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer prv_test_123");
      return Promise.resolve(
        new Response(JSON.stringify({ data: { id: "txn_123", status: "VOIDED" } }), { status: 200 })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const refund = await createWompiRefund({ WOMPI_SECRET_KEY: "prv_test_123" } as Env, "txn_123", undefined, 1000);
    expect(refund).toEqual({ id: "txn_123", status: "VOIDED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows a full-amount refund request (amountCents equal to the order total)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: { id: "txn_123", status: "VOIDED" } }), { status: 200 })))
    );

    const refund = await createWompiRefund({ WOMPI_SECRET_KEY: "prv_test_123" } as Env, "txn_123", 1000, 1000);
    expect(refund.id).toBe("txn_123");
  });

  it("throws with the Wompi error reason when the void call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ error: { reason: "TRANSACTION_ALREADY_VOIDED" } }), { status: 422 }))
      )
    );

    await expect(
      createWompiRefund({ WOMPI_SECRET_KEY: "prv_test_123" } as Env, "txn_123", undefined, 1000)
    ).rejects.toThrow("Wompi refund could not be created");
  });
});
