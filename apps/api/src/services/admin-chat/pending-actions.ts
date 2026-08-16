import type { Env } from "../../types";

export type PendingActionStatus = "pending" | "confirmed" | "expired" | "cancelled" | "failed";

export type PendingActionRow = {
  id: string;
  conversation_id: string;
  actor_id: string;
  tool_name: string;
  target_type: string;
  target_id: string | null;
  params_json: string;
  diff_json: string;
  status: PendingActionStatus;
  idempotency_key: string;
  request_id: string;
  result_json: string | null;
  expires_at: string;
  created_at: string;
  resolved_at: string | null;
};

async function stableHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Deterministic per (actor, tool, exact params) so a retried tool call after
// a dropped connection reuses the same pending row instead of creating a
// second preview the operator could separately confirm - same principle as
// apps/ai-assistant's own idempotencyKey(). Params in this codebase's tools
// are flat objects, so a single-level key sort is enough to canonicalize.
export async function deriveIdempotencyKey(actorId: string, toolName: string, params: Record<string, unknown>): Promise<string> {
  const normalized = JSON.stringify(params, Object.keys(params).sort());
  return `chat_${await stableHash(`${actorId}:${toolName}:${normalized}`)}`;
}

export async function createPendingAction(
  env: Env,
  input: {
    conversationId: string;
    actorId: string;
    toolName: string;
    targetType: string;
    targetId: string | null;
    params: Record<string, unknown>;
    diff: unknown;
    requestId: string;
  }
): Promise<{ operationId: string; expiresAt: string }> {
  const idempotencyKey = await deriveIdempotencyKey(input.actorId, input.toolName, input.params);

  const existing = await env.DB.prepare(
    "select id, expires_at from admin_chat_pending_actions where idempotency_key = ? and status = 'pending'"
  )
    .bind(idempotencyKey)
    .first<{ id: string; expires_at: string }>();
  if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
    return { operationId: existing.id, expiresAt: existing.expires_at };
  }

  const id = `pact_${crypto.randomUUID()}`;
  const ttlMinutes = Number(env.ADMIN_CHAT_PENDING_ACTION_TTL_MINUTES || 5) || 5;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  // Bound, not SQLite's own current_timestamp: that keyword renders as
  // "YYYY-MM-DD HH:MM:SS" (space, no "Z"), while expires_at is always a JS
  // .toISOString() value ("YYYY-MM-DDTHH:MM:SS.sssZ"). Confirmed live this
  // session that comparing the two directly in SQL is a silent bug, not
  // just a style choice: `<=` on TEXT columns is a byte-wise string
  // comparison, and " " (0x20) sorts before "T" (0x54) - so
  // current_timestamp's string form always compares as "less than" an
  // expires_at from the same day, no matter which one is chronologically
  // later. The WHERE clause below relies on this comparison being correct
  // to detect a stale row, so both sides must be the same JS-generated
  // ISO format.
  const nowIso = new Date().toISOString();

  // The operator's own "Cancel" button on a pending_action card is purely
  // client-side (PendingActionCard just sets local state, never calls a
  // backend endpoint) - the row this ties to stays status='pending' in D1
  // forever unless it's actually confirmed, or claimPendingAction happens
  // to run into it past its expires_at. That means the idempotency_key
  // collision below is routine, not exceptional: ask for the exact same
  // mutation again after ignoring/cancelling the first preview (or after
  // it simply times out unconfirmed) and this insert hits a still-'pending'
  // row that's already expired. `do nothing` used to leave that stale row
  // in place and the read-back below would return its long-past expiresAt
  // - the operator would see an already-expired preview no matter how many
  // times they asked. `do update ... where` only overwrites when the
  // conflicting row is no longer usable (not pending, or past its TTL) -
  // a genuinely in-flight duplicate (the fast-path check above already
  // returned for that case) never reaches this far, so it's never touched.
  await env.DB.prepare(
    `insert into admin_chat_pending_actions
       (id, conversation_id, actor_id, tool_name, target_type, target_id, params_json, diff_json, idempotency_key, request_id, expires_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(idempotency_key) do update set
       id = excluded.id,
       target_type = excluded.target_type,
       target_id = excluded.target_id,
       params_json = excluded.params_json,
       diff_json = excluded.diff_json,
       request_id = excluded.request_id,
       expires_at = excluded.expires_at,
       status = 'pending',
       result_json = null,
       resolved_at = null,
       created_at = current_timestamp
     where admin_chat_pending_actions.status != 'pending' or admin_chat_pending_actions.expires_at <= ?`
  )
    .bind(
      id,
      input.conversationId,
      input.actorId,
      input.toolName,
      input.targetType,
      input.targetId,
      JSON.stringify(input.params),
      JSON.stringify(input.diff),
      idempotencyKey,
      input.requestId,
      expiresAt,
      nowIso
    )
    .run();

  // A concurrent identical request may have won the insert - read back by
  // the idempotency key rather than trusting the locally generated id.
  const row = await env.DB.prepare("select id, expires_at from admin_chat_pending_actions where idempotency_key = ?")
    .bind(idempotencyKey)
    .first<{ id: string; expires_at: string }>();
  return { operationId: row?.id ?? id, expiresAt: row?.expires_at ?? expiresAt };
}

export type ClaimOutcome =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "expired"; diff: unknown }
  | { kind: "replay"; result: Record<string, unknown> }
  | { kind: "claimed"; row: PendingActionRow };

// Atomically transitions pending -> confirmed so a double-click, a
// reconnect, or a retried confirm can never execute the underlying mutation
// twice - the same conditional-update-guarded-by-meta.changes pattern
// PATCH /admin/orders/:id/status already uses. Callers execute the real
// mutation only after receiving `{kind: "claimed"}`, then call
// resolvePendingAction with the outcome.
export async function claimPendingAction(env: Env, operationId: string, actorId: string): Promise<ClaimOutcome> {
  const row = await env.DB.prepare("select * from admin_chat_pending_actions where id = ?")
    .bind(operationId)
    .first<PendingActionRow>();
  if (!row) return { kind: "not_found" };
  if (row.actor_id !== actorId) return { kind: "forbidden" };

  if ((row.status === "confirmed" || row.status === "failed") && row.result_json) {
    return { kind: "replay", result: JSON.parse(row.result_json) as Record<string, unknown> };
  }
  if (row.status !== "pending") {
    return { kind: "expired", diff: JSON.parse(row.diff_json) };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare("update admin_chat_pending_actions set status = 'expired' where id = ? and status = 'pending'")
      .bind(operationId)
      .run();
    return { kind: "expired", diff: JSON.parse(row.diff_json) };
  }

  const claim = await env.DB.prepare(
    "update admin_chat_pending_actions set status = 'confirmed', resolved_at = CURRENT_TIMESTAMP where id = ? and status = 'pending'"
  )
    .bind(operationId)
    .run();
  if ((claim.meta.changes ?? 0) !== 1) {
    // Lost the race to a concurrent confirm for the same operationId -
    // re-read and resolve through the same branches as any other caller.
    return claimPendingAction(env, operationId, actorId);
  }

  return { kind: "claimed", row };
}

export async function resolvePendingAction(
  env: Env,
  operationId: string,
  outcome: { status: "confirmed" | "failed"; result: Record<string, unknown> }
): Promise<void> {
  await env.DB.prepare("update admin_chat_pending_actions set status = ?, result_json = ? where id = ?")
    .bind(outcome.status, JSON.stringify(outcome.result), operationId)
    .run();
}
