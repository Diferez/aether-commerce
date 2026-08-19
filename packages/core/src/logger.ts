import { redact } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

// Every field a call site might reasonably want to attach, typed so
// "orderId" can't be misspelled "order_id" in one call and "orderid" in
// another. Anything not in this list is treated as free-form context and
// lands under `metadata` (redacted) instead of as a top-level field.
export interface LogContext {
  timestamp?: string | undefined;
  level?: LogLevel | undefined;
  environment?: string | undefined;
  service?: string | undefined;
  event?: string | undefined;
  message?: string | undefined;
  requestId?: string | undefined;
  traceId?: string | undefined;
  route?: string | undefined;
  method?: string | undefined;
  statusCode?: number | undefined;
  durationMs?: number | undefined;
  userId?: string | undefined;
  adminId?: string | undefined;
  storeId?: string | undefined;
  orderId?: string | undefined;
  productId?: string | undefined;
  webhookEventId?: string | undefined;
  errorCode?: string | undefined;
  errorName?: string | undefined;
  errorMessage?: string | undefined;
  stack?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

const KNOWN_CONTEXT_KEYS = new Set<string>([
  "message",
  "requestId",
  "traceId",
  "route",
  "method",
  "statusCode",
  "durationMs",
  "userId",
  "adminId",
  "storeId",
  "orderId",
  "productId",
  "webhookEventId",
  "errorCode",
  "errorName",
  "errorMessage",
  "stack"
]);

export type LogInput = Partial<Pick<LogContext,
  | "message" | "requestId" | "traceId" | "route" | "method" | "statusCode" | "durationMs"
  | "userId" | "adminId" | "storeId" | "orderId" | "productId" | "webhookEventId"
  | "errorCode" | "errorName" | "errorMessage" | "stack" | "metadata"
>> & {
  /** Convenience: pass a caught value here and the logger fills errorName/errorMessage/stack/errorCode. */
  error?: unknown;
  [extra: string]: unknown;
};

export type LogTransport = (entry: Record<string, unknown>, level: LogLevel) => void;

export type LoggerConfig = {
  level?: LogLevel;
  environment?: string;
  service?: string;
  /** 0..1 - fraction of "info" calls actually emitted. Errors/warnings are never sampled. */
  infoSampleRate?: number;
  /** Extension point for a future OpenTelemetry (or other) exporter - swap this, keep every call site unchanged. */
  transport?: LogTransport;
};

export type Logger = {
  debug: (event: string, input?: LogInput) => void;
  info: (event: string, input?: LogInput) => void;
  warn: (event: string, input?: LogInput) => void;
  error: (event: string, input?: LogInput) => void;
};

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MAX_METADATA_JSON_LENGTH = 8000;

export function serializeError(error: unknown): { errorName: string; errorMessage: string; stack?: string; errorCode?: string } {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const result: { errorName: string; errorMessage: string; stack?: string; errorCode?: string } = {
      errorName: error.name || "Error",
      errorMessage: error.message
    };
    if (error.stack) result.stack = error.stack;
    if (typeof code === "string") result.errorCode = code;
    return result;
  }
  if (typeof error === "string") return { errorName: "Error", errorMessage: error };
  try {
    return { errorName: "UnknownError", errorMessage: JSON.stringify(redact(error)) };
  } catch {
    return { errorName: "UnknownError", errorMessage: "Non-serializable error value" };
  }
}

function limitMetadataSize(metadata: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(metadata);
  if (json.length <= MAX_METADATA_JSON_LENGTH) return metadata;
  return { truncated: true, preview: json.slice(0, MAX_METADATA_JSON_LENGTH) };
}

function consoleTransport(entry: Record<string, unknown>, level: LogLevel): void {
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function shouldEmit(level: LogLevel, config: Required<LoggerConfig>): boolean {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[config.level]) return false;
  if (level === "info" && config.infoSampleRate < 1) {
    return Math.random() < config.infoSampleRate;
  }
  return true;
}

function emit(level: LogLevel, event: string, input: LogInput | undefined, config: Required<LoggerConfig>): void {
  if (!shouldEmit(level, config)) return;

  const { error: rawError, metadata: explicitMetadata, ...rest } = input ?? {};
  const known: Record<string, unknown> = {};
  const extra: Record<string, unknown> = explicitMetadata ? { ...explicitMetadata } : {};

  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    if (KNOWN_CONTEXT_KEYS.has(key)) known[key] = value;
    else extra[key] = value;
  }

  if (rawError !== undefined) {
    const serialized = serializeError(rawError);
    if (known.errorName === undefined) known.errorName = serialized.errorName;
    if (known.errorMessage === undefined) known.errorMessage = serialized.errorMessage;
    // Stack traces are backend-only by construction: this logger only ever
    // writes to console (Workers Logs), which is never shipped to a
    // browser - callers building an HTTP error response use classifyError
    // + AppError.userMessage instead, which never carries a stack.
    if (known.stack === undefined && serialized.stack !== undefined) known.stack = serialized.stack;
    if (known.errorCode === undefined && serialized.errorCode !== undefined) known.errorCode = serialized.errorCode;
  }

  const hasMetadata = Object.keys(extra).length > 0;
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    environment: config.environment,
    service: config.service,
    event,
    ...known,
    ...(hasMetadata ? { metadata: limitMetadataSize(redact(extra) as Record<string, unknown>) } : {})
  };

  config.transport(entry, level);
}

// Creates a logger bound to one environment/service (typically once per
// request, from env vars - see apps/api/src/lib/logger.ts's getLogger).
// `logger.info("order.status_changed", { requestId, orderId, adminId,
// previousStatus, newStatus })` - known LogContext fields land as top-level
// JSON keys, everything else (previousStatus/newStatus here) is redacted
// and nested under `metadata`.
export function createLogger(config: LoggerConfig = {}): Logger {
  const resolved: Required<LoggerConfig> = {
    level: config.level ?? "info",
    environment: config.environment ?? "development",
    service: config.service ?? "aether",
    infoSampleRate: config.infoSampleRate ?? 1,
    transport: config.transport ?? consoleTransport
  };

  return {
    debug: (event, input) => emit("debug", event, input, resolved),
    info: (event, input) => emit("info", event, input, resolved),
    warn: (event, input) => emit("warn", event, input, resolved),
    error: (event, input) => emit("error", event, input, resolved)
  };
}
