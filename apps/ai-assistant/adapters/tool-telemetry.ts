import { AgentToolTelemetry, type AgentToolTelemetryRepository } from "@aether/agent-core";
import type { AgentAuditEvent } from "@aether/observability";

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
};

/** D1 adapter for agent audit events and corresponding usage counters. */
export function createD1AgentToolTelemetry(
  db: D1Database,
  incrementToolCall: (scope: string) => Promise<void>
): AgentToolTelemetry {
  const repository: AgentToolTelemetryRepository = {
    async appendAuditEvent(event: AgentAuditEvent) {
      await db
        .prepare(
          `insert into ai_action_audit (
             event_id, request_id, thread_id, user_or_session_hash, tool_name,
             normalized_arguments, target_entity_id, idempotency_key,
             authorization_result, execution_status, error_code, created_at
           ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
        )
        .bind(
          crypto.randomUUID(),
          event.request_id,
          event.thread_id,
          event.user_or_session_hash,
          event.tool_name,
          event.normalized_arguments,
          event.target_entity_id,
          event.idempotency_key,
          event.authorization_result,
          event.execution_status,
          event.error_code
        )
        .run();
    },
    incrementToolCall
  };
  return new AgentToolTelemetry(repository);
}
