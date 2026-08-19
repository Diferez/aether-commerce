import { describe, expect, it } from "vitest";
import { redact } from "./redact";

describe("redact", () => {
  it("fully redacts known secret keys regardless of casing", () => {
    const result = redact({ password: "hunter2", Token: "abc", ACCESSTOKEN: "xyz", apiKey: "sk_live_123" }) as Record<string, unknown>;
    expect(result.password).toBe("[REDACTED]");
    expect(result.Token).toBe("[REDACTED]");
    expect(result.ACCESSTOKEN).toBe("[REDACTED]");
    expect(result.apiKey).toBe("[REDACTED]");
  });

  it("redacts compound secret-like keys via suffix matching", () => {
    const result = redact({ csrfToken: "a", sessionSecret: "b", userPassword: "c" }) as Record<string, unknown>;
    expect(result.csrfToken).toBe("[REDACTED]");
    expect(result.sessionSecret).toBe("[REDACTED]");
    expect(result.userPassword).toBe("[REDACTED]");
  });

  it("redacts card fields (number, cvc, cvv) without touching unrelated *Number fields", () => {
    const result = redact({ number: "4242424242424242", cvc: "123", cvv: "456", orderNumber: "AETH-1", trackingNumber: "1Z999" }) as Record<
      string,
      unknown
    >;
    expect(result.number).toBe("[REDACTED]");
    expect(result.cvc).toBe("[REDACTED]");
    expect(result.cvv).toBe("[REDACTED]");
    expect(result.orderNumber).toBe("AETH-1");
    expect(result.trackingNumber).toBe("1Z999");
  });

  it("redacts recursively inside nested objects and arrays", () => {
    const result = redact({
      order: { id: "ord_1", customer: { email: "ana@example.com", payment: { cardNumber: "4111111111111111", clientSecret: "cs_test_1" } } },
      items: [{ sku: "A", token: "tok_1" }, { sku: "B", token: "tok_2" }]
    }) as Record<string, unknown>;

    const order = result.order as Record<string, unknown>;
    const customer = order.customer as Record<string, unknown>;
    const payment = customer.payment as Record<string, unknown>;
    expect(payment.cardNumber).toBe("[REDACTED]");
    expect(payment.clientSecret).toBe("[REDACTED]");
    expect(customer.email).toBe("a***@example.com");

    const items = result.items as Array<Record<string, unknown>>;
    expect(items[0]?.token).toBe("[REDACTED]");
    expect(items[1]?.token).toBe("[REDACTED]");
    expect(items[0]?.sku).toBe("A");
  });

  it("masks emails, phones, and IPs instead of fully dropping them", () => {
    const result = redact({ email: "ana@example.com", customerPhone: "+1-555-123-4567", ipAddress: "203.0.113.42" }) as Record<string, unknown>;
    expect(result.email).toBe("a***@example.com");
    expect(result.customerPhone).toMatch(/^\*\*\*\d{2}$/);
    expect(result.ipAddress).toBe("203.0.113.***");
  });

  it("fully redacts address-shaped objects but preserves addressId", () => {
    const result = redact({ addressId: "addr_1", shippingAddress: { line1: "123 Main St", city: "Metropolis" } }) as Record<string, unknown>;
    expect(result.addressId).toBe("addr_1");
    expect(result.shippingAddress).toBe("[REDACTED]");
  });

  it("converts Error instances to {name, message} without a stack trace", () => {
    const error = new TypeError("boom");
    const result = redact({ error }) as Record<string, unknown>;
    expect(result.error).toEqual({ name: "TypeError", message: "boom" });
    expect(result.error).not.toHaveProperty("stack");
  });

  it("breaks circular references instead of throwing or recursing forever", () => {
    const node: Record<string, unknown> = { name: "root" };
    node.self = node;
    const result = redact(node) as Record<string, unknown>;
    expect(result.name).toBe("root");
    expect(result.self).toBe("[Circular]");
  });

  it("caps array length and truncates long strings", () => {
    const bigArray = Array.from({ length: 80 }, (_, i) => i);
    const result = redact({ items: bigArray, note: "x".repeat(3000) }) as Record<string, unknown>;
    const items = result.items as unknown[];
    expect(items.length).toBe(51); // 50 items + one "…N more" marker
    expect(String(items.at(-1))).toMatch(/more$/);
    expect(String(result.note).length).toBeLessThan(3000);
  });

  it("passes through plain, non-sensitive values unchanged", () => {
    expect(redact({ orderId: "ord_1", total: 4999, active: true, tag: null })).toEqual({
      orderId: "ord_1",
      total: 4999,
      active: true,
      tag: null
    });
  });
});
