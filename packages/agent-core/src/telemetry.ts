import type { AgentAuditEvent } from "@aether-commerce/observability";

export interface AgentToolTelemetryRepository {
  appendAuditEvent(event: AgentAuditEvent): Promise<void>;
  incrementToolCall(scope: string): Promise<void>;
}

/** Records a tool outcome and keeps actor/project counters in lockstep. */
export class AgentToolTelemetry {
  constructor(private readonly repository: AgentToolTelemetryRepository) {}

  async record(event: AgentAuditEvent): Promise<void> {
    await this.repository.appendAuditEvent(event);
    await this.repository.incrementToolCall(event.user_or_session_hash);
    await this.repository.incrementToolCall("project");
  }
}
