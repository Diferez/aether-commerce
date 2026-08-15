// Single source of truth for event names, reused by the logger, audit
// service, and metrics so "order.status_changed" is never typed slightly
// differently in three different files. Add new events here, not as
// inline string literals at the call site.
export const OBSERVABILITY_EVENTS = {
  authLoginSucceeded: "auth.login_succeeded",
  authLoginFailed: "auth.login_failed",
  authLogout: "auth.logout",
  authPermissionDenied: "auth.permission_denied",

  productCreated: "product.created",
  productUpdated: "product.updated",
  productDeleted: "product.deleted",
  productStockChanged: "product.stock_changed",
  productPriceChanged: "product.price_changed",

  orderCreated: "order.created",
  orderUpdated: "order.updated",
  orderStatusChanged: "order.status_changed",
  orderCancelled: "order.cancelled",
  orderFulfilled: "order.fulfilled",
  orderUpdateFailed: "order.update_failed",

  customerUpdated: "customer.updated",
  customerDeleted: "customer.deleted",

  settingsUpdated: "settings.updated",

  paymentStarted: "payment.started",
  paymentSucceeded: "payment.succeeded",
  paymentFailed: "payment.failed",
  paymentRefunded: "payment.refunded",

  webhookReceived: "webhook.received",
  webhookDuplicate: "webhook.duplicate",
  webhookProcessing: "webhook.processing",
  webhookProcessed: "webhook.processed",
  webhookFailed: "webhook.failed",
  webhookRetrying: "webhook.retrying",

  databaseQueryFailed: "database.query_failed",
  externalApiFailed: "external_api.failed",
  applicationUnhandledError: "application.unhandled_error",
  securitySuspiciousActivity: "security.suspicious_activity"
} as const;

export type ObservabilityEvent = (typeof OBSERVABILITY_EVENTS)[keyof typeof OBSERVABILITY_EVENTS];

const EVENT_NAME_SET = new Set<string>(Object.values(OBSERVABILITY_EVENTS));

export function isKnownObservabilityEvent(value: string): value is ObservabilityEvent {
  return EVENT_NAME_SET.has(value);
}
