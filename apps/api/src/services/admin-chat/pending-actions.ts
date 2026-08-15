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

  await env.DB.prepare(
    `insert into admin_chat_pending_actions
       (id, conversation_id, actor_id, tool_name, target_type, target_id, params_json, diff_json, idempotency_key, request_id, expires_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(idempotency_key) do nothing`
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
      expiresAt
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
