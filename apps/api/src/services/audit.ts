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
// same insert shape.
export async function writeAuditLog(env: Env, entry: AuditLogEntry): Promise<void> {
  await env.DB.prepare(
    `insert into audit_logs (id, actor_id, action, target_type, target_id, payload_json)
     values (?, ?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), entry.actorId, entry.action, entry.targetType, entry.targetId, JSON.stringify(entry.payload ?? {}))
    .run();
}
