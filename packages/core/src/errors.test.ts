import { describe, expect, it } from "vitest";
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  classifyError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  NotFoundError,
  PaymentError,
  ValidationError
} from "./errors";

describe("AppError subclasses", () => {
  it("ValidationError is expected, not reportable, and maps to 422", () => {
    const error = new ValidationError("email is required");
    expect(error.statusCode).toBe(422);
    expect(error.classification).toBe("expected");
    expect(error.reportable).toBe(false);
    expect(error.code).toBe("VALIDATION_ERROR");
  });

  it("AuthenticationError maps to 401 and AuthorizationError to 403, both expected", () => {
    expect(new AuthenticationError().statusCode).toBe(401);
    expect(new AuthenticationError().classification).toBe("expected");
    expect(new AuthorizationError().statusCode).toBe(403);
    expect(new AuthorizationError().classification).toBe("expected");
  });

  it("NotFoundError maps to 404 and ConflictError to 409, both expected and not reportable by default", () => {
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new NotFoundError().reportable).toBe(false);
    expect(new ConflictError().statusCode).toBe(409);
    expect(new ConflictError().reportable).toBe(false);
  });

  it("ExternalServiceError and DatabaseError are unexpected and reportable by default", () => {
    const external = new ExternalServiceError("Stripe timed out");
    expect(external.statusCode).toBe(502);
    expect(external.classification).toBe("unexpected");
    expect(external.reportable).toBe(true);

    const db = new DatabaseError("D1 write failed");
    expect(db.statusCode).toBe(500);
    expect(db.classification).toBe("unexpected");
    expect(db.reportable).toBe(true);
  });

  it("PaymentError defaults to unexpected/reportable but can be marked as an expected decline", () => {
    const unexpected = new PaymentError("Stripe API returned malformed JSON");
    expect(unexpected.classification).toBe("unexpected");
    expect(unexpected.reportable).toBe(true);

    const decline = new PaymentError("Card declined", { classification: "expected", reportable: false });
    expect(decline.classification).toBe("expected");
    expect(decline.reportable).toBe(false);
  });

  it("never leaks the internal/technical message as the user-facing message unless explicitly reused", () => {
    const error = new DatabaseError("duplicate key value violates unique constraint \"orders_number_key\"");
    expect(error.userMessage).not.toContain("orders_number_key");
    expect(error.message).toContain("orders_number_key");
  });

  it("carries metadata and an optional cause without putting them in the user-facing message", () => {
    const cause = new Error("underlying failure");
    const error = new AppError("CUSTOM_CODE", { message: "internal detail", metadata: { orderId: "ord_1" }, cause });
    expect(error.metadata).toEqual({ orderId: "ord_1" });
    expect(error.cause).toBe(cause);
  });
});

describe("classifyError", () => {
  it("passes through an AppError's own fields", () => {
    const error = new ValidationError("bad input", { code: "BAD_INPUT" });
    const classified = classifyError(error);
    expect(classified).toEqual({
      statusCode: 422,
      code: "BAD_INPUT",
      userMessage: "bad input",
      classification: "expected",
      reportable: false,
      metadata: undefined
    });
  });

  it("normalizes a bare Error (or any non-AppError value) into a generic, reportable 500", () => {
    expect(classifyError(new Error("unexpected"))).toEqual({
      statusCode: 500,
      code: "INTERNAL_ERROR",
      userMessage: "The request could not be completed.",
      classification: "unexpected",
      reportable: true
    });
    expect(classifyError("a rejected string")).toMatchObject({ statusCode: 500, code: "INTERNAL_ERROR", reportable: true });
  });
});
