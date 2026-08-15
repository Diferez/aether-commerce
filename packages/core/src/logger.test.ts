import { describe, expect, it, vi } from "vitest";
import { createLogger, serializeError, type LogLevel } from "./logger";

function capture() {
  const entries: Array<{ entry: Record<string, unknown>; level: LogLevel }> = [];
  const transport = vi.fn((entry: Record<string, unknown>, level: LogLevel) => {
    entries.push({ entry, level });
  });
  return { entries, transport };
}

describe("createLogger", () => {
  it("emits a structured entry with timestamp, environment, service, and event on every call", () => {
    const { entries, transport } = capture();
    const logger = createLogger({ environment: "production", service: "aether-api", transport });

    logger.info("order.status_changed", { requestId: "req_1", orderId: "ord_1" });

    expect(entries).toHaveLength(1);
    const { entry, level } = entries[0]!;
    expect(level).toBe("info");
    expect(entry.event).toBe("order.status_changed");
    expect(entry.environment).toBe("production");
    expect(entry.service).toBe("aether-api");
    expect(entry.requestId).toBe("req_1");
    expect(entry.orderId).toBe("ord_1");
    expect(typeof entry.timestamp).toBe("string");
  });

  it("routes unknown fields into a redacted metadata bag, keeping known LogContext fields top-level", () => {
    const { entries, transport } = capture();
    const logger = createLogger({ transport });

    logger.info("order.status_changed", { requestId: "req_1", orderId: "ord_1", previousStatus: "processing", newStatus: "shipped" });

    const { entry } = entries[0]!;
    expect(entry.requestId).toBe("req_1");
    expect(entry).not.toHaveProperty("previousStatus");
    expect(entry.metadata).toEqual({ previousStatus: "processing", newStatus: "shipped" });
  });

  it("redacts secrets that land in metadata", () => {
    const { entries, transport } = capture();
    const logger = createLogger({ transport });

    logger.info("auth.login_succeeded", { userId: "usr_1", metadata: { sessionToken: "tok_secret" } });

    const { entry } = entries[0]!;
    expect((entry.metadata as Record<string, unknown>).sessionToken).toBe("[REDACTED]");
  });

  it("expands a raw Error passed as `error` into errorName/errorMessage/stack", () => {
    const { entries, transport } = capture();
    const logger = createLogger({ transport });

    logger.error("order.update_failed", { requestId: "req_1", orderId: "ord_1", error: new TypeError("boom") });

    const { entry } = entries[0]!;
    expect(entry.errorName).toBe("TypeError");
    expect(entry.errorMessage).toBe("boom");
    expect(typeof entry.stack).toBe("string");
  });

  it("never drops an error-level call regardless of level threshold or sample rate", () => {
    const { entries, transport } = capture();
    const logger = createLogger({ level: "error", infoSampleRate: 0, transport });

    logger.error("application.unhandled_error", { requestId: "req_1" });

    expect(entries).toHaveLength(1);
  });

  it("suppresses debug/info calls below the configured level threshold", () => {
    const { entries, transport } = capture();
    const logger = createLogger({ level: "warn", transport });

    logger.debug("some.debug.event", {});
    logger.info("some.info.event", {});
    logger.warn("some.warn.event", {});

    expect(entries.map((e) => e.entry.event)).toEqual(["some.warn.event"]);
  });

  it("samples info logs down to roughly the configured rate", () => {
    const { entries, transport } = capture();
    const logger = createLogger({ level: "info", infoSampleRate: 0, transport });

    for (let i = 0; i < 20; i++) logger.info("high.volume.event", {});

    expect(entries).toHaveLength(0);
  });

  it("always emits warn calls, independent of the info sample rate", () => {
    const { entries, transport } = capture();
    const logger = createLogger({ infoSampleRate: 0, transport });

    logger.warn("order.update_failed", {});

    expect(entries).toHaveLength(1);
  });

  it("writes error-level entries via console.error and info via console.log so Workers Logs can filter by severity", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger({});

    logger.error("application.unhandled_error", {});
    logger.info("order.created", {});

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe("serializeError", () => {
  it("extracts name, message, and stack from a real Error", () => {
    const result = serializeError(new RangeError("out of bounds"));
    expect(result.errorName).toBe("RangeError");
    expect(result.errorMessage).toBe("out of bounds");
    expect(typeof result.stack).toBe("string");
  });

  it("handles a plain string thrown instead of an Error", () => {
    expect(serializeError("something broke")).toEqual({ errorName: "Error", errorMessage: "something broke" });
  });

  it("never throws for a non-serializable or circular value", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => serializeError(circular)).not.toThrow();
  });
});
