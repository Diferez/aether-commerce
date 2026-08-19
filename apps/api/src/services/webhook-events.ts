import { WebhookEventService, type WebhookEventRepository } from "@aether/api-core";

/** D1 adapter for idempotent provider webhook event persistence. */
export function createWebhookEventService(db: D1Database): WebhookEventService {
  const repository: WebhookEventRepository = {
    async record(event) {
      await db
        .prepare(
          `insert into webhook_events
            (id, provider, provider_event_id, payload_json, processed_at, created_at, updated_at)
           values (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           on conflict(provider_event_id) do nothing`
        )
        .bind(event.id, event.provider, event.providerEventId, event.payload)
        .run();
    }
  };
  return new WebhookEventService(repository, () => crypto.randomUUID());
}
