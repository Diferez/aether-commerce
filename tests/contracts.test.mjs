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
    read("database/core/migrations/0001_initial.sql"),
    read("database/core/migrations/0003_required_commerce_schema.sql"),
    read("database/core/migrations/0004_demo_operational_data.sql")
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
  for (const state of [
    "pending_payment",
    "payment_processing",
    "paid",
    "processing",
    "shipped",
    "refund_requested",
    "returned",
    "closed"
  ]) {
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
  assert.match(cartRoutes, /cartRoutes\.post\("\/session"/);
  assert.match(cartRoutes, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(cartRoutes, /\/:id\/token/);
  assert.match(cartRoutes, /cartRoutes\.get\("\/:id"/);
  assert.match(cartRoutes, /cartRoutes\.post\("\/:id\/items"/);
  assert.match(cartRoutes, /cartRoutes\.patch\(/);
  assert.match(cartRoutes, /updateItemQuantity/);
  assert.match(cartRoutes, /cartRoutes\.delete\("\/:id\/items\/:itemId"/);
  assert.match(cartTokenService, /HMAC/);
  assert.match(cartTokenService, /timingSafeEqualText/);
  assert.match(cartTokenService, /exp/);
  assert.match(storefrontCartClient, /x-aether-cart-token/);
  assert.match(storefrontCartClient, /\/api\/v1\/cart\/session/);
  assert.match(storefrontCartClient, /getCartCredentials/);
  assert.match(cartPage, /getCartCredentials/);
  assert.match(cartPage, /x-aether-cart-token/);
});

test("sensitive signatures and account order lookup avoid enumeration paths", () => {
  const secureCompare = read("apps/api/src/services/secure-compare.ts");
  const stripeService = read("apps/api/src/services/stripe.ts");
  const wompiService = read("apps/api/src/services/wompi.ts");
  const accountRoutes = read("apps/api/src/routes/account.ts");
  const checkoutRoutes = read("apps/api/src/routes/checkout.ts");
  const cartClient = read("apps/storefront/components/cart-client.ts");
  const clerkService = read("apps/api/src/services/clerk.ts");
  const publicRoutes = read("apps/api/src/routes/public.ts");
  const clerkProvider = read("apps/storefront/components/ClerkAuthProvider.tsx");
  const cors = read("apps/api/src/middleware/cors.ts");

  assert.match(secureCompare, /timingSafeEqual/);
  assert.match(stripeService, /STRIPE_SIGNATURE_TOLERANCE_SECONDS/);
  assert.match(stripeService, /timingSafeEqualText/);
  assert.match(wompiService, /timingSafeEqualText/);
  assert.match(stripeService, /metadata\[userId\]/);
  assert.match(stripeService, /customer_email/);
  assert.match(checkoutRoutes, /AUTH_REQUIRED/);
  assert.match(checkoutRoutes, /verifyCartToken/);
  assert.match(checkoutRoutes, /CART_OWNERSHIP_MISMATCH/);
  assert.match(checkoutRoutes, /CHECKOUT_OWNERSHIP_MISMATCH/);
  assert.match(checkoutRoutes, /\.\.\.cart,\s*\n\s*userId: actor\.userId,/);
  // Moved from an inline fetch in cart/page.tsx into a shared
  // createCheckoutSession() (apps/storefront/components/cart-client.ts) so
  // the storefront's new /checkout page (shipping address collection) can
  // reuse the exact same auth/cart-token plumbing instead of duplicating it.
  assert.match(cartClient, /authorization: `Bearer \$\{authToken\}`/);
  assert.match(cartClient, /"x-aether-cart-token": cartToken/);
  assert.match(accountRoutes, /resolveActorEmail/);
  assert.match(accountRoutes, /email = \? collate nocase/);
  assert.match(clerkService, /https:\/\/api\.clerk\.com\/v1\/users/);
  assert.match(clerkService, /CLERK_SECRET_KEY/);
  assert.match(publicRoutes, /runtime-config/);
  assert.match(publicRoutes, /clerkPublishableKey/);
  assert.match(publicRoutes, /CLERK_JWT_ISSUER/);
  assert.match(clerkProvider, /runtime-config/);
  assert.match(clerkProvider, /clerk\.example\.com/);
  assert.match(clerkProvider, /AetherAuthContext\.Provider/);
  assert.match(clerkProvider, /NEXT_PUBLIC_AETHER_E2E/);
  assert.doesNotMatch(clerkProvider, /min-h-screen/);
  assert.doesNotMatch(clerkProvider, /prefetchUI/);
  assert.doesNotMatch(accountRoutes, /x-aether-customer-email/);
  assert.doesNotMatch(accountRoutes, /lower\(email\)/);
  assert.doesNotMatch(cors, /x-aether-customer-email/);
});

test("checkout provider abstraction covers Stripe and Wompi behind one port", () => {
  const checkoutCore = read("packages/api-core/src/checkout.ts");
  const checkoutRoutes = read("apps/api/src/routes/checkout.ts");
  const checkoutSettings = read("apps/api/src/services/checkout-settings.ts");
  const adminRoutes = read("apps/api/src/routes/admin.ts");

  assert.match(checkoutCore, /export interface CheckoutProvider/);
  assert.match(checkoutCore, /checkoutProviderIds = \["stripe", "wompi"\]/);
  assert.doesNotMatch(checkoutRoutes, /createStripeCheckoutProvider/);
  assert.match(checkoutRoutes, /resolveActiveCheckoutProvider/);
  assert.match(checkoutSettings, /encryptSecret/);
  assert.match(checkoutSettings, /decryptSecret/);
  assert.match(adminRoutes, /requirePermission\("settings.manage"\)/);
  assert.match(adminRoutes, /checkout-settings/);
});

test("readiness and order status updates fail safely", () => {
  const index = read("apps/api/src/index.ts");
  const http = read("apps/api/src/http.ts");
  const admin = read("apps/api/src/routes/admin.ts");
  // The state-machine check, history insert, and batched write live in
  // changeOrderState() (services/orders.ts) - shared by this admin route and
  // the customer-facing cancel/return/refund-request routes in user.ts, so
  // this guarantee is checked where the logic actually is, not duplicated.
  const orders = read("apps/api/src/services/orders.ts");

  assert.match(index, /fail\(c, 503, "SERVICE_UNAVAILABLE"/);
  assert.match(index, /status: "degraded"/);
  assert.match(http, /\| 503/);
  assert.match(admin, /orderStateSchema/);
  assert.match(admin, /ORDER_STATE_CONFLICT/);
  assert.match(orders, /canTransitionOrder/);
  assert.match(orders, /previous_state, new_state/);
  assert.match(orders, /env\.DB\.batch/);
});

test("CI uses deterministic guest auth and the assistant is a LangGraph Worker", () => {
  const packageJson = read("package.json");
  const workflow = read(".github/workflows/ci.yml");
  const evaluationWorkflow = read(".github/workflows/ai-gemini-evaluation.yml");
  const assistantPackage = read("apps/ai-assistant/package.json");
  const worker = read("apps/ai-assistant/worker.ts");
  const widget = read("apps/storefront/components/AssistantWidget.tsx");

  assert.match(packageJson, /NEXT_PUBLIC_AETHER_E2E=true/);
  assert.doesNotMatch(
    packageJson,
    /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y2xlcmsuZXhhbXBsZS5jb20k/
  );
  assert.match(workflow, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk_test_Y2xlcmsuZXhhbXBsZS5jb20k/);
  assert.doesNotMatch(evaluationWorkflow, /GEMINI_API_KEY/);
  assert.match(evaluationWorkflow, /AETHER_AI_EVAL_URL/);
  assert.match(assistantPackage, /@langchain\/langgraph/);
  assert.match(worker, /new StateGraph/);
  assert.match(worker, /GET_MY_ORDERS/);
  assert.match(worker, /new URL\("\/api\/v1\/orders"/);
  assert.match(worker, /validBearerAuthorization/);
  assert.match(worker, /content-type,authorization,x-aether-cart-id/);
  assert.match(worker, /numberEnv\(env\.AI_RATE_LIMIT_ANONYMOUS_PER_DAY\)/);
  assert.doesNotMatch(worker, /AI_RATE_LIMIT_AUTHENTICATED_PER_DAY/);
  assert.match(widget, /useAetherAuth/);
  assert.match(widget, /const sessionToken = await getToken\(\)/);
  assert.match(widget, /headers\.authorization = `Bearer \$\{sessionToken\}`/);
  assert.match(widget, /message\.orders\?\.length/);
});

test("API rate limiting uses Cloudflare bindings with local fallback", () => {
  const middleware = read("apps/api/src/middleware/rate-limit.ts");
  const index = read("apps/api/src/index.ts");
  const types = read("apps/api/src/types.ts");
  const wrangler = read("apps/api/wrangler.jsonc");
  const deployConfig = read("scripts/write-api-wrangler-config.mjs");

  for (const binding of [
    "RATE_LIMITER_GLOBAL",
    "RATE_LIMITER_ACCOUNT",
    "RATE_LIMITER_MUTATION",
    "RATE_LIMITER_SENSITIVE"
  ]) {
    assert.match(types, new RegExp(`${binding}\\?: RateLimit`));
    assert.match(wrangler, new RegExp(`"name": "${binding}"`));
    assert.match(deployConfig, new RegExp(`name: "${binding}"`));
    assert.match(middleware, new RegExp(`c\\.env\\.${binding}`));
  }

  assert.match(middleware, /profileForRequest/);
  assert.match(middleware, /normalizedRouteKey/);
  assert.match(middleware, /Retry-After/);
  assert.match(middleware, /localLimit/);
  assert.match(middleware, /profile === "account" && !actor\.userId/);
  assert.match(middleware, /user:\$\{await digest\(actor\.userId\)\}/);
  assert.doesNotMatch(middleware, /digest\(authorization\)/);
  assert.doesNotMatch(middleware, /digest\(cartToken\)/);
  assert.match(middleware, /Only verified identities receive their own bucket/);
  assert.ok(index.indexOf('app.use("*", auth())') < index.indexOf('app.use("*", rateLimit())'));
});

test("storefront assistant CTA keeps readable active and hover colors", () => {
  const hero = read("apps/storefront/components/Hero.tsx");

  assert.match(hero, /heroCtaSecondary/);
  assert.match(hero, /hover:bg-accent/);
  assert.match(hero, /hover:text-white/);
  assert.match(hero, /active:bg-accent-hover/);
  assert.doesNotMatch(hero, /hover:bg-zinc-100/);
});

test("storefront exports a branded custom 404 through Cloudflare static assets", () => {
  const notFoundPage = read("apps/storefront/app/not-found.tsx");
  const storefrontWrangler = read("apps/storefront/wrangler.jsonc");

  assert.match(notFoundPage, /notFoundTitle/);
  assert.match(notFoundPage, /returnHome/);
  assert.match(notFoundPage, /exploreCatalog/);
  assert.match(storefrontWrangler, /"not_found_handling": "404-page"/);
});

test("admin product management routes are real (not the old orphaned override stubs)", () => {
  const admin = read("apps/api/src/routes/admin.ts");

  // The old PATCH/PUT/DELETE .../override routes wrote to product_overrides
  // but catalog.ts never read that table back - "editing" a product from
  // admin never changed what a shopper saw. Confirms that dead path is gone.
  assert.doesNotMatch(admin, /product_overrides/);

  assert.match(admin, /adminRoutes\.post\(\s*"\/products",\s*requirePermission\("products\.write"\)/);
  assert.match(admin, /adminRoutes\.patch\(\s*"\/products\/:id",\s*requirePermission\("products\.write"\)/);
  assert.match(admin, /adminRoutes\.post\("\/products\/:id\/publish", requirePermission\("products\.write"\)/);
  assert.match(admin, /adminRoutes\.post\("\/products\/:id\/archive", requirePermission\("products\.write"\)/);
  assert.match(admin, /adminRoutes\.post\(\s*"\/products\/bulk",\s*requirePermission\("products\.write"\)/);
  assert.match(admin, /adminRoutes\.delete\("\/products\/:id", requirePermission\("products\.write"\)/);
  assert.match(admin, /adminRoutes\.post\(\s*"\/products\/:id\/inventory-adjustment",\s*requirePermission\("inventory\.write"\)/);
  assert.match(admin, /adminRoutes\.post\("\/uploads\/signature", requirePermission\("products\.write"\)/);
});

test("products table is the catalog's source of truth, not the bundled JSON snapshot", () => {
  const migration = read("database/core/migrations/0013_products_table.sql");
  const seed = read("database/core/migrations/0014_seed_products_from_json.sql");
  const catalog = read("apps/api/src/services/catalog.ts");

  for (const column of ["sku TEXT NOT NULL UNIQUE", "slug TEXT NOT NULL UNIQUE", "visibility TEXT NOT NULL", "details_json TEXT NOT NULL"]) {
    assert.match(migration, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(seed, /INSERT OR IGNORE INTO products/);
  assert.match(catalog, /select \* from products order by updated_at desc/);
  assert.doesNotMatch(catalog, /typedLocalProducts/);
});

test("Cloudinary upload signing never sends the api_secret to the browser", () => {
  const cloudinary = read("apps/api/src/services/cloudinary.ts");
  const form = read("apps/admin/components/ProductForm.tsx");

  assert.match(cloudinary, /CLOUDINARY_API_SECRET/);
  assert.doesNotMatch(form, /CLOUDINARY_API_SECRET/);
  assert.match(form, /api\.cloudinary\.com\/v1_1\//);
  assert.match(form, /signature/);
});

test("security headers prevent framing and unsafe content sniffing on both static applications", () => {
  for (const path of ["apps/storefront/public/_headers", "apps/admin/public/_headers"]) {
    const headers = read(path);
    assert.match(headers, /Strict-Transport-Security:/);
    assert.match(headers, /X-Content-Type-Options: nosniff/);
    assert.match(headers, /X-Frame-Options: DENY/);
    assert.match(headers, /Content-Security-Policy:/);
    assert.match(headers, /frame-ancestors 'none'/);
  }
});

test("checkout orders require an immutable server-side snapshot", () => {
  const migration = read("database/core/migrations/0021_security_hardening.sql");
  const checkout = read("apps/api/src/routes/checkout.ts");
  const orders = read("apps/api/src/services/orders.ts");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS checkout_snapshots/);
  assert.match(checkout, /createCheckoutSnapshot/);
  assert.match(orders, /loadCheckoutSnapshot/);
  assert.match(orders, /amount does not match the immutable snapshot/);
  assert.doesNotMatch(orders, /await readCart\(env, cartId\)/);
});

test("assistant consent and Gemini credential transport are enforced server-side", () => {
  const worker = read("apps/ai-assistant/worker.ts");
  assert.match(worker, /CONSENT_REQUIRED/);
  assert.match(worker, /"x-goog-api-key": env\.GEMINI_API_KEY/);
  assert.doesNotMatch(worker, /generateContent\?key=/);
});
