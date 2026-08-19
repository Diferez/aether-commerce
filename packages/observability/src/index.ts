const allowedHttpStatuses = new Set([400, 401, 403, 404, 409, 422, 429, 500, 502, 503]);

// Deliberately permissive about characters (covers UUIDs, ULIDs, and
// whatever format an upstream proxy or client SDK generates) but bounded in
// length - a client-supplied id is never trusted blindly, just accepted if
// it's shaped like a real correlation id and replaced with a fresh UUID
// otherwise.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export function createRequestId(incoming?: string | null): string {
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
}

export function normalizeErrorStatus(status: number): 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503 {
  return allowedHttpStatuses.has(status) ? (status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503) : 500;
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
