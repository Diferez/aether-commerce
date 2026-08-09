import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

const root = process.cwd().endsWith("aether-commerce") ? process.cwd() : resolve("aether-commerce");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readMigrations() {
  return [
    read("apps/api/migrations/0001_initial.sql"),
    read("apps/api/migrations/0003_required_commerce_schema.sql"),
    read("apps/api/migrations/0004_demo_operational_data.sql")
  ].join("\n");
}

test("D1 schema includes every required domain table", () => {
  const migration = readMigrations();
  const requiredTables = [
    "users",
    "user_addresses",
    "products_cache",
    "product_overrides",
    "category_overrides",
    "product_variants",
    "inventory",
    "inventory_reservations",
    "inventory_movements",
    "carts",
    "cart_items",
    "favorites",
    "product_comparisons",
    "orders",
    "order_items",
    "order_status_history",
    "payments",
    "refunds",
    "shipments",
    "shipment_events",
    "coupons",
    "coupon_redemptions",
    "reviews",
    "review_votes",
    "admin_roles",
    "admin_permissions",
    "admin_user_roles",
    "audit_logs",
    "contact_messages",
    "application_settings",
    "webhook_events",
    "email_events",
    "idempotency_keys"
  ];

  for (const table of requiredTables) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test("API response helpers use the documented envelope", () => {
  const http = read("apps/api/src/http.ts");
  assert.match(http, /success: true/);
  assert.match(http, /success: false/);
  assert.match(http, /requestId/);
  assert.match(http, /pagination/);
});

test("public demo admin blocks persistent changes", () => {
  const adminMiddleware = read("apps/api/src/middleware/admin.ts");
  const dashboard = read("apps/admin/components/AdminDashboard.tsx");
  assert.match(adminMiddleware, /DEMO_MODE/);
  assert.match(dashboard, /Public demo mode\. Changes are disabled\./);
  assert.match(dashboard, /Modo de demostracion publica\. Los cambios estan deshabilitados\./);
});

test("money values are represented as integer cents", () => {
  const productSchema = read("packages/schemas/src/product.ts");
  const orderAdr = read("docs/adr/0002-integer-cents.md");
  assert.match(productSchema, /price: z\.number\(\)\.int\(\)/);
  assert.match(productSchema, /finalPrice: z\.number\(\)\.int\(\)/);
  assert.match(orderAdr, /integer cents/);
});

test("public API includes the requested route groups", () => {
  const spec = read("docs/openapi/aether.v1.yaml");
  for (const route of [
    "/products:",
    "/categories:",
    "/search:",
    "/featured-products:",
    "/deals:",
    "/new-arrivals:",
    "/admin/dashboard:",
    "/admin/products:",
    "/admin/orders:"
  ]) {
    assert.match(spec, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("order state machine includes required commerce states", () => {
  const schema = read("packages/schemas/src/order.ts");
  for (const state of ["pending_payment", "payment_processing", "paid", "processing", "shipped", "refund_requested", "returned", "closed"]) {
    assert.match(schema, new RegExp(`"${state}"`));
  }
});

test("cart reads and mutations require signed cart token", () => {
  const cartRoutes = read("apps/api/src/routes/cart.ts");
  const cartTokenService = read("apps/api/src/services/cart-token.ts");
  const storefrontCartClient = read("apps/storefront/components/cart-client.ts");
  const cartPage = read("apps/storefront/app/cart/page.tsx");

  assert.match(cartRoutes, /verifyCartToken/);
  assert.match(cartRoutes, /CART_TOKEN_REQUIRED/);
  assert.match(cartRoutes, /cartRoutes\.get\("\/:id"/);
  assert.match(cartRoutes, /cartRoutes\.post\("\/:id\/items"/);
  assert.match(cartRoutes, /cartRoutes\.patch\(/);
  assert.match(cartRoutes, /updateItemQuantity/);
  assert.match(cartRoutes, /cartRoutes\.delete\("\/:id\/items\/:itemId"/);
  assert.match(cartTokenService, /HMAC/);
  assert.match(cartTokenService, /exp/);
  assert.match(storefrontCartClient, /x-aether-cart-token/);
  assert.match(cartPage, /getCartToken/);
  assert.match(cartPage, /x-aether-cart-token/);
});
