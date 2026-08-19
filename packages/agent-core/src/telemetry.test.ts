import { describe, expect, it } from "vitest";
import { AgentToolTelemetry, type AgentToolTelemetryRepository } from "./telemetry";

describe("agent tool telemetry", () => {
  it("writes the audit event before incrementing the actor and project counters", async () => {
    const steps: string[] = [];
    const repository: AgentToolTelemetryRepository = {
      appendAuditEvent: () => {
        steps.push("audit");
        return Promise.resolve();
      },
      incrementToolCall: (scope) => {
        steps.push(scope);
        return Promise.resolve();
      }
    };
    await new AgentToolTelemetry(repository).record({
      request_id: "request",
      thread_id: "thread",
      user_or_session_hash: "actor",
      tool_name: "search",
      normalized_arguments: "query:phone",
      target_entity_id: null,
      idempotency_key: "key",
      authorization_result: "allowed",
      execution_status: "succeeded",
      error_code: null
    });
    expect(steps).toEqual(["audit", "actor", "project"]);
  });
});
