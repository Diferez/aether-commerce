import { redact } from "@aether-commerce/core";
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
): Promise<{ shouldProcess: boolean; isNew: boolean }> {
  const insert = await env.DB.prepare(
    `insert into webhook_events
       (id, provider, provider_event_id, payload_json, status, request_id, received_at, created_at, updated_at)
     values (?, ?, ?, ?, 'received', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     on conflict(provider, provider_event_id) do nothing`
  )
    .bind(crypto.randomUUID(), input.provider, input.eventId, JSON.stringify(redact(input.summary)), input.requestId)
    .run();
  if ((insert.meta.changes ?? 0) > 0) {
    return { shouldProcess: true, isNew: true };
  }

  // A provider retries non-2xx deliveries with the same event id. Processed
  // events remain idempotent duplicates; failed/retrying events and a stale
  // processing claim may be atomically reclaimed by exactly one request.
  const reclaim = await env.DB.prepare(
    `update webhook_events
     set status = 'retrying', request_id = ?, error_code = null, error_message = null,
         next_retry_at = null, updated_at = CURRENT_TIMESTAMP
     where provider = ? and provider_event_id = ? and (
       status in ('failed', 'retrying') or
       (status = 'processing' and processing_started_at < datetime('now', '-10 minutes'))
     )`
  )
    .bind(input.requestId, input.provider, input.eventId)
    .run();
  return { shouldProcess: (reclaim.meta.changes ?? 0) === 1, isNew: false };
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
     set status = 'failed', error_code = ?, error_message = ?, next_retry_at = datetime('now', '+1 minute'), updated_at = CURRENT_TIMESTAMP
     where provider = ? and provider_event_id = ?`
  )
    .bind(error.code ?? null, error.message.slice(0, 300), provider, eventId)
    .run();
}

export type WebhookEventRow = {
  provider: string;
  provider_event_id: string;
  status: string;
  attempts: number;
  error_code: string | null;
  error_message: string | null;
  request_id: string | null;
  received_at: string;
  processed_at: string | null;
};

// Backs both a future GET /admin/webhooks list view and the admin-chat
// get_webhook_activity tool - deliberately never selects payload_json
// (only ever a minimized summary to begin with, but still not something
// either surface needs to show).
export async function listRecentWebhookEvents(
  env: Env,
  filters: { status?: string | undefined; provider?: string | undefined; limit: number }
): Promise<WebhookEventRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (filters.provider) {
    where.push("provider = ?");
    params.push(filters.provider);
  }
  const whereClause = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const rows = await env.DB.prepare(
    `select provider, provider_event_id, status, attempts, error_code, error_message, request_id, received_at, processed_at
     from webhook_events ${whereClause} order by created_at desc limit ?`
  )
    .bind(...params, filters.limit)
    .all<WebhookEventRow>();
  return rows.results ?? [];
}
