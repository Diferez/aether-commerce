import { redact } from "@aether/core";
import type { Env } from "../types";

// Shared state-tracking for every webhook provider (Stripe, Clerk) against
// the webhook_events table extended in migration 0020. The dedup mechanism
// itself - provider_event_id UNIQUE plus on-conflict-do-nothing - is
// unchanged from the original table (migration 0001); this only adds
// status/attempt/error tracking on top of it, so an existing insert that
// already worked keeps working exactly the same way.
//
// summary is stored instead of the full raw payload - just enough to
// identify the event later (id, type, and the affected object's id), redacted
// defensively. The full body is never persisted; verifyStripeSignature /
// verifyClerkSignature/the actual processing logic only ever see it as the
// in-memory request body, never round-tripped through D1.
export async function recordWebhookReceived(
  env: Env,
  input: { provider: string; eventId: string; requestId: string; summary: unknown }
): Promise<{ isNew: boolean }> {
  const insert = await env.DB.prepare(
    `insert into webhook_events
       (id, provider, provider_event_id, payload_json, status, request_id, received_at, created_at, updated_at)
     values (?, ?, ?, ?, 'received', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     on conflict(provider_event_id) do nothing`
  )
    .bind(crypto.randomUUID(), input.provider, input.eventId, JSON.stringify(redact(input.summary)), input.requestId)
    .run();
  return { isNew: (insert.meta.changes ?? 0) > 0 };
}

export async function markWebhookProcessing(env: Env, provider: string, eventId: string): Promise<void> {
  await env.DB.prepare(
    `update webhook_events
     set status = 'processing', processing_started_at = CURRENT_TIMESTAMP, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
     where provider = ? and provider_event_id = ?`
  )
    .bind(provider, eventId)
    .run();
}

export async function markWebhookProcessed(env: Env, provider: string, eventId: string): Promise<void> {
  await env.DB.prepare(
    `update webhook_events set status = 'processed', processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     where provider = ? and provider_event_id = ?`
  )
    .bind(provider, eventId)
    .run();
}

// error_message is truncated - this column exists for a human glancing at
// "System health" to recognize what broke, not to be a second log store.
export async function markWebhookFailed(env: Env, provider: string, eventId: string, error: { code?: string; message: string }): Promise<void> {
  await env.DB.prepare(
    `update webhook_events
     set status = 'failed', error_code = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
     where provider = ? and provider_event_id = ?`
  )
    .bind(error.code ?? null, error.message.slice(0, 300), provider, eventId)
    .run();
}
