import { describe, expect, it } from "vitest";
import { isKnownObservabilityEvent, OBSERVABILITY_EVENTS } from "./events";

describe("OBSERVABILITY_EVENTS", () => {
  it("includes every event name required by the observability spec", () => {
    const required = [
      "auth.login_succeeded",
      "auth.login_failed",
      "auth.logout",
      "auth.permission_denied",
      "product.created",
      "product.updated",
      "product.deleted",
      "product.stock_changed",
      "product.price_changed",
      "order.created",
      "order.updated",
      "order.status_changed",
      "order.cancelled",
      "order.fulfilled",
      "order.update_failed",
      "customer.updated",
      "customer.deleted",
      "settings.updated",
      "payment.started",
      "payment.succeeded",
      "payment.failed",
      "payment.refunded",
      "webhook.received",
      "webhook.duplicate",
      "webhook.processing",
      "webhook.processed",
      "webhook.failed",
      "webhook.retrying",
      "database.query_failed",
      "external_api.failed",
      "application.unhandled_error",
      "security.suspicious_activity"
    ];
    const values = Object.values(OBSERVABILITY_EVENTS);
    for (const name of required) {
      expect(values).toContain(name);
    }
  });

  it("has no duplicate event name values", () => {
    const values = Object.values(OBSERVABILITY_EVENTS);
    expect(new Set(values).size).toBe(values.length);
  });

  it("follows a single dot-separated lower_snake convention", () => {
    for (const value of Object.values(OBSERVABILITY_EVENTS)) {
      expect(value).toMatch(/^[a-z]+(_[a-z]+)*\.[a-z]+(_[a-z]+)*$/);
    }
  });
});

describe("isKnownObservabilityEvent", () => {
  it("recognizes a catalog event", () => {
    expect(isKnownObservabilityEvent("order.status_changed")).toBe(true);
  });

  it("rejects an unregistered event name", () => {
    expect(isKnownObservabilityEvent("order.made_up_event")).toBe(false);
  });
});
