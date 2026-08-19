import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP")
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  clerkId: text("clerk_id").notNull(),
  email: text("email").notNull(),
  name: text("name"),
  rolesJson: text("roles_json").notNull().default("[\"customer\"]"),
  ...timestamps
});

export const addresses = sqliteTable("addresses", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  label: text("label").notNull(),
  payloadJson: text("payload_json").notNull(),
  ...timestamps
});

export const productCache = sqliteTable("product_cache", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  slug: text("slug").notNull(),
  payloadJson: text("payload_json").notNull(),
  expiresAt: text("expires_at").notNull(),
  ...timestamps
});

export const productOverrides = sqliteTable("product_overrides", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  payloadJson: text("payload_json").notNull(),
  ...timestamps
});

export const inventory = sqliteTable("inventory", {
  sku: text("sku").primaryKey(),
  productId: text("product_id").notNull(),
  available: integer("available").notNull(),
  reserved: integer("reserved").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(4),
  ...timestamps
});

export const carts = sqliteTable("carts", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  anonymousId: text("anonymous_id"),
  payloadJson: text("payload_json").notNull(),
  ...timestamps
});

export const checkoutSnapshots = sqliteTable(
  "checkout_snapshots",
  {
    id: text("id").primaryKey(),
    cartId: text("cart_id").notNull(),
    userId: text("user_id").notNull(),
    cartPayloadJson: text("cart_payload_json").notNull(),
    amountTotal: integer("amount_total").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("active"),
    providerSessionId: text("provider_session_id"),
    expiresAt: text("expires_at").notNull(),
    completedAt: text("completed_at"),
    ...timestamps
  },
  (table) => ({
    providerSessionIdIdx: uniqueIndex("checkout_snapshots_provider_session_id_idx").on(table.providerSessionId)
  })
);

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  number: text("number").notNull(),
  userId: text("user_id"),
  email: text("email").notNull(),
  state: text("state").notNull(),
  payloadJson: text("payload_json").notNull(),
  total: integer("total").notNull(),
  currency: text("currency").notNull().default("USD"),
  ...timestamps
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  status: text("status").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  ...timestamps
});

export const webhookEvents = sqliteTable(
  "webhook_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status").notNull().default("received"),
    attempts: integer("attempts").notNull().default(0),
    requestId: text("request_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    processingStartedAt: text("processing_started_at"),
    nextRetryAt: text("next_retry_at"),
    receivedAt: text("received_at").notNull().default("CURRENT_TIMESTAMP"),
    processedAt: text("processed_at"),
    ...timestamps
  },
  (table) => ({
    providerEventIdIdx: uniqueIndex("webhook_events_provider_event_id_idx").on(table.provider, table.providerEventId)
  })
);
