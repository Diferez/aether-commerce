import type { Actor } from "@aether-commerce/schemas";
import { redact } from "@aether-commerce/core";
import type { Env } from "../types";

export type AuditLogEntry = {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  payload?: unknown;
};

// Generic write path for audit_logs, shared by every admin mutation that
// needs a real audit trail (see GET /admin/audit) - customers.ts wrote its
// own insert directly since it only needed two call sites; every other
// mutation added since then goes through this one instead of repeating the
// same insert shape. Kept exactly as-is (unchanged SQL, unchanged call
// sites) - auditService.record below is the richer, newer path (real
// actor role, requestId, before/after diff); existing call sites are not
// force-migrated in this pass.
export async function writeAuditLog(env: Env, entry: AuditLogEntry): Promise<void> {
  await env.DB.prepare(
    `insert into audit_logs (id, actor_id, action, target_type, target_id, payload_json)
     values (?, ?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), entry.actorId, entry.action, entry.targetType, entry.targetId, JSON.stringify(entry.payload ?? {}))
    .run();
}

const MAX_DIFF_JSON_LENGTH = 4000;

function truncatedJson(value: unknown): string | null {
  if (value === undefined) return null;
  const json = JSON.stringify(redact(value));
  return json.length > MAX_DIFF_JSON_LENGTH ? JSON.stringify({ truncated: true, preview: json.slice(0, MAX_DIFF_JSON_LENGTH) }) : json;
}

// Shallow diff: only keys that actually differ between before/after, not
// two full snapshots - "guardar diferencias relevantes, no objetos
// gigantes". Falls back to storing the raw (redacted) value when either
// side isn't a plain object (e.g. a bulk action's before/after is a scalar
// count) or when there's nothing to compare it against.
function diffFields(previous: unknown, next: unknown): { previous: unknown; next: unknown } {
  if (
    previous === undefined ||
    next === undefined ||
    typeof previous !== "object" ||
    typeof next !== "object" ||
    previous === null ||
    next === null ||
    Array.isArray(previous) ||
    Array.isArray(next)
  ) {
    return { previous, next };
  }
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(previous as Record<string, unknown>), ...Object.keys(next as Record<string, unknown>)]);
  for (const key of keys) {
    const a = (previous as Record<string, unknown>)[key];
    const b = (next as Record<string, unknown>)[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      before[key] = a;
      after[key] = b;
    }
  }
  return { previous: before, next: after };
}

export type AuditRecordInput = {
  /** Always the actor read from the authenticated session (c.get("actor")) - never accept this from a request body. */
  actor: Actor;
  action: string;
  entity: { type: string; id: string | null };
  previousData?: unknown;
  newData?: unknown;
  requestId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

// The richer audit write path: computes a real before/after diff (not two
// full snapshots), redacts secrets/PII out of both sides and metadata,
// bounds size, and records requestId + the actor's role at the time of the
// action. Append-only by construction - there is no update/delete export
// from this module, and nothing in the admin API ever issues one. Throws
// (does not swallow) on failure - a caller that awaits this and ignores a
// rejection is a bug at the call site, not a silent audit gap here.
export async function recordAudit(env: Env, input: AuditRecordInput): Promise<void> {
  const { previous, next } = diffFields(input.previousData, input.newData);
  await env.DB.prepare(
    `insert into audit_logs
       (id, actor_id, actor_role, action, target_type, target_id, payload_json, previous_data, new_data, request_id, ip_address, user_agent)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      input.actor.userId ?? "unknown",
      input.actor.roles[0] ?? null,
      input.action,
      input.entity.type,
      input.entity.id,
      truncatedJson(input.metadata) ?? "{}",
      truncatedJson(previous),
      truncatedJson(next),
      input.requestId,
      input.ipAddress ?? null,
      input.userAgent ?? null
    )
    .run();
}

export const auditService = { record: recordAudit };
