import { describe, expect, it } from "vitest";
import { parseStripeWebhookPayload, WebhookEventService, type WebhookEventRepository } from "./webhooks";

describe("webhook events", () => {
  it("keeps provider payloads behind a persistence port", async () => {
    const events: string[] = [];
    const repository: WebhookEventRepository = { record: (event) => { events.push(`${event.provider}:${event.providerEventId}`); return Promise.resolve(); } };
    await new WebhookEventService(repository, () => "id").record("stripe", "event", "{}");
    expect(events).toEqual(["stripe:event"]);
  });

  it("exposes only the checkout event shape to provider adapters", () => {
    expect(parseStripeWebhookPayload('{"id":"event","type":"checkout.session.completed"}')).toMatchObject({ id: "event", type: "checkout.session.completed" });
  });
});
