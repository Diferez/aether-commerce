// Central error hierarchy so every layer (API routes, admin-chat tools,
// webhook handlers) throws something with a stable code, an HTTP status,
// a message safe to show a user, and a flag for whether it's worth paging
// someone about - instead of throwing bare Error/string and letting each
// catch block guess at those four things independently.

export type ErrorClassification = "expected" | "unexpected";

export type AllowedHttpStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503;

export type AppErrorOptions = {
  message?: string | undefined;
  userMessage?: string | undefined;
  statusCode?: AllowedHttpStatus | undefined;
  classification?: ErrorClassification | undefined;
  metadata?: Record<string, unknown> | undefined;
  reportable?: boolean | undefined;
  cause?: unknown;
};

// code is the stable, machine-readable identifier (goes in the API
// response and in Sentry's fingerprint) - message is the internal/technical
// detail (goes to logs only), userMessage is what's safe to show the
// caller. classification distinguishes "the operator did something the
// system correctly rejected" (expected - validation, permission, not
// found) from "something broke" (unexpected - a bug, a dependency down).
// reportable defaults from classification but can be overridden per throw
// site (e.g. a validation error worth flagging as suspicious).
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: AllowedHttpStatus;
  readonly userMessage: string;
  readonly classification: ErrorClassification;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly reportable: boolean;

  constructor(code: string, options: AppErrorOptions = {}) {
    super(options.message ?? options.userMessage ?? code, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = options.statusCode ?? 500;
    this.userMessage = options.userMessage ?? "Something went wrong. Please try again.";
    this.classification = options.classification ?? "unexpected";
    this.metadata = options.metadata;
    this.reportable = options.reportable ?? this.classification === "unexpected";
  }
}

type SubclassOptions = Omit<AppErrorOptions, "statusCode" | "classification"> & { code?: string };

export class ValidationError extends AppError {
  constructor(message: string, options: SubclassOptions = {}) {
    super(options.code ?? "VALIDATION_ERROR", {
      message,
      userMessage: options.userMessage ?? message,
      statusCode: 422,
      classification: "expected",
      reportable: options.reportable ?? false,
      metadata: options.metadata,
      cause: options.cause
    });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication is required.", options: SubclassOptions = {}) {
    super(options.code ?? "AUTHENTICATION_ERROR", {
      message,
      userMessage: options.userMessage ?? message,
      statusCode: 401,
      classification: "expected",
      reportable: options.reportable ?? false,
      metadata: options.metadata,
      cause: options.cause
    });
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission for this action.", options: SubclassOptions = {}) {
    super(options.code ?? "AUTHORIZATION_ERROR", {
      message,
      userMessage: options.userMessage ?? message,
      statusCode: 403,
      classification: "expected",
      reportable: options.reportable ?? false,
      metadata: options.metadata,
      cause: options.cause
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.", options: SubclassOptions = {}) {
    super(options.code ?? "NOT_FOUND", {
      message,
      userMessage: options.userMessage ?? message,
      statusCode: 404,
      classification: "expected",
      reportable: options.reportable ?? false,
      metadata: options.metadata,
      cause: options.cause
    });
  }
}

export class ConflictError extends AppError {
  constructor(message = "This action conflicts with the current state.", options: SubclassOptions = {}) {
    super(options.code ?? "CONFLICT", {
      message,
      userMessage: options.userMessage ?? message,
      statusCode: 409,
      classification: "expected",
      reportable: options.reportable ?? false,
      metadata: options.metadata,
      cause: options.cause
    });
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, options: SubclassOptions = {}) {
    super(options.code ?? "EXTERNAL_SERVICE_ERROR", {
      message,
      userMessage: options.userMessage ?? "An external service is temporarily unavailable.",
      statusCode: 502,
      classification: "unexpected",
      reportable: options.reportable ?? true,
      metadata: options.metadata,
      cause: options.cause
    });
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, options: SubclassOptions = {}) {
    super(options.code ?? "DATABASE_ERROR", {
      message,
      userMessage: options.userMessage ?? "A database error occurred. Please try again.",
      statusCode: 500,
      classification: "unexpected",
      reportable: options.reportable ?? true,
      metadata: options.metadata,
      cause: options.cause
    });
  }
}

// Defaults to "unexpected"/reportable - a normal card decline should be
// thrown with { classification: "expected", reportable: false } at the
// call site so routine declines don't page anyone; the default here covers
// the more dangerous case (a payment provider integration actually broke).
export class PaymentError extends AppError {
  constructor(message: string, options: Omit<AppErrorOptions, "statusCode"> & { code?: string } = {}) {
    super(options.code ?? "PAYMENT_ERROR", {
      message,
      userMessage: options.userMessage ?? "We could not process the payment.",
      statusCode: 502,
      classification: options.classification ?? "unexpected",
      reportable: options.reportable ?? (options.classification ?? "unexpected") === "unexpected",
      metadata: options.metadata,
      cause: options.cause
    });
  }
}

export type ClassifiedError = {
  statusCode: AllowedHttpStatus;
  code: string;
  userMessage: string;
  classification: ErrorClassification;
  reportable: boolean;
  metadata?: Record<string, unknown> | undefined;
};

// Normalizes anything a catch block might see - an AppError, a bare Error
// thrown by a dependency, a rejected non-Error value - into one consistent
// shape so callers (the API's error boundary, the admin-chat tool
// boundary) don't need their own instanceof ladder.
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      userMessage: error.userMessage,
      classification: error.classification,
      reportable: error.reportable,
      metadata: error.metadata
    };
  }
  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    userMessage: "The request could not be completed.",
    classification: "unexpected",
    reportable: true
  };
}
