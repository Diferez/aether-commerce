const allowedHttpStatuses = new Set([400, 401, 403, 404, 409, 422, 429, 500]);

export function createRequestId(incoming?: string | null, maxLength = 80): string {
  return incoming && incoming.length <= maxLength ? incoming : crypto.randomUUID();
}

export function normalizeErrorStatus(status: number): 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 {
  return allowedHttpStatuses.has(status) ? (status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500) : 500;
}

export type StructuredLogger = {
  error(event: string, attributes: Record<string, unknown>): void;
};

export function createConsoleLogger(): StructuredLogger {
  return {
    error(event, attributes) {
      console.error(event, attributes);
    }
  };
}
