import { describe, expect, it } from "vitest";
import {
  createCheckoutReturnUrls,
  isCheckoutSessionPaid,
  CheckoutSettingsService,
  type CheckoutSettings,
  type CheckoutSettingsRepository
} from "./checkout";

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
    expect(isCheckoutSessionPaid({ id: "session_1", status: "paid" })).toBe(true);
    expect(isCheckoutSessionPaid({ id: "session_2", status: "pending" })).toBe(false);
  });
});

function fakeRepository(initial: CheckoutSettings | null = null): CheckoutSettingsRepository & { stored: CheckoutSettings | null } {
  const state: { value: CheckoutSettings | null } = { value: initial };
  return {
    get stored() {
      return state.value;
    },
    read: () => Promise.resolve(state.value),
    write: (settings) => {
      state.value = settings;
      return Promise.resolve();
    }
  };
}

const envFallback: CheckoutSettings = {
  mode: "stripe",
  stripe: { secretKey: "sk_env_fallback", webhookSecret: "whsec_env_fallback" },
  wompi: {}
};

describe("checkout settings service", () => {
  it("falls back to env-var settings when nothing is stored", async () => {
    const service = new CheckoutSettingsService(fakeRepository(null));
    expect(await service.get(envFallback)).toEqual(envFallback);
  });

  it("prefers a stored credential over the env fallback, field by field", async () => {
    const repository = fakeRepository({
      mode: "wompi",
      stripe: { secretKey: "sk_stored_override" },
      wompi: { secretKey: "prv_test_wompi" }
    });
    const service = new CheckoutSettingsService(repository);

    expect(await service.get(envFallback)).toEqual({
      mode: "wompi",
      stripe: { secretKey: "sk_stored_override", webhookSecret: "whsec_env_fallback" },
      wompi: { secretKey: "prv_test_wompi" }
    });
  });

  it("merges a partial update onto what is already stored, not onto the fallback", async () => {
    const repository = fakeRepository({ mode: "stripe", stripe: { secretKey: "sk_original" }, wompi: {} });
    const service = new CheckoutSettingsService(repository);

    await service.update({ wompi: { secretKey: "prv_test_new" } });

    expect(repository.stored).toEqual({
      mode: "stripe",
      stripe: { secretKey: "sk_original" },
      wompi: { secretKey: "prv_test_new" }
    });
  });

  it("switching mode alone does not touch either provider's credentials", async () => {
    const repository = fakeRepository({ mode: "stripe", stripe: { secretKey: "sk_original" }, wompi: { secretKey: "prv_original" } });
    const service = new CheckoutSettingsService(repository);

    await service.update({ mode: "wompi" });

    expect(repository.stored).toEqual({
      mode: "wompi",
      stripe: { secretKey: "sk_original" },
      wompi: { secretKey: "prv_original" }
    });
  });

  it("summarizes without ever exposing the plaintext secret", async () => {
    const service = new CheckoutSettingsService(
      fakeRepository({ mode: "stripe", stripe: { secretKey: "sk_test_abc12345", webhookSecret: "whsec_x" }, wompi: {} })
    );

    const summary = await service.summarize(envFallback);

    expect(summary).toEqual({
      mode: "stripe",
      stripe: { configured: true, secretKeyPreview: "sk_tes••••2345", webhookConfigured: true },
      wompi: { configured: false, secretKeyPreview: null, webhookConfigured: false }
    });
    expect(JSON.stringify(summary)).not.toContain("sk_test_abc12345");
  });
});
