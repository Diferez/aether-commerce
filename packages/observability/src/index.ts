const allowedHttpStatuses = new Set([400, 401, 403, 404, 409, 422, 429, 500, 503]);

export function createRequestId(incoming?: string | null, maxLength = 80): string {
  return incoming && incoming.length <= maxLength ? incoming : crypto.randomUUID();
}

export function normalizeErrorStatus(status: number): 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503 {
  return allowedHttpStatuses.has(status) ? (status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503) : 500;
}

export type StructuredLogger = {
  error(event: string, attributes: Record<string, unknown>): void;
};

/** Portable audit contract shared by runtime adapters and storage backends. */
export type AgentAuditEvent = {
  request_id: string;
  thread_id: string;
  user_or_session_hash: string;
  tool_name: string;
  normalized_arguments: string;
  target_entity_id: string | null;
  idempotency_key: string;
  authorization_result: "allowed" | "denied";
  execution_status: "succeeded" | "failed" | "blocked";
  error_code: string | null;
};

export function createConsoleLogger(): StructuredLogger {
  return {
    error(event, attributes) {
      console.error(event, attributes);
    }
  };
}
