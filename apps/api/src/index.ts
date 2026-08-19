import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppBindings } from "./types";
import { auth } from "./middleware/auth";
import { aetherCors } from "./middleware/cors";
import { errorBoundary } from "./middleware/errors";
import { rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { fail, ok } from "./http";
import { accountRoutes } from "./routes/account";
import { adminRoutes } from "./routes/admin";
import { cartRoutes } from "./routes/cart";
import { catalogRoutes } from "./routes/catalog";
import { checkoutRoutes } from "./routes/checkout";
import { contactRoutes } from "./routes/contact";
import { clerkPublishableKey, publicRoutes } from "./routes/public";
import { userRoutes } from "./routes/user";
import { webhookRoutes } from "./routes/webhooks";
import { getStripeSecretKeyStatus } from "./services/stripe";

const app = new Hono<AppBindings>();

app.use("*", errorBoundary());
app.use("*", requestId());
app.use("*", secureHeaders());
app.use("*", aetherCors());
app.use("*", auth());
app.use("*", rateLimit());

app.get("/", (c) => ok(c, { name: "Aether API", version: "v1", basePath: "/api/v1" }));

const api = new Hono<AppBindings>().basePath("/api/v1");
api.get("/runtime-config", (c) => {
  c.header("Cache-Control", "public, max-age=300, s-maxage=300");
  return ok(c, {
    clerkPublishableKey: clerkPublishableKey(c.env.CLERK_JWT_ISSUER, c.env.CLERK_SECRET_KEY)
  });
});

api.get("/health", async (c) => {
  const time = new Date().toISOString();
  try {
    await c.env.DB.prepare("select 1 as ok").first();
  } catch (error) {
    console.error(JSON.stringify({
      message: "D1 readiness check failed",
      requestId: c.get("requestId"),
      error: error instanceof Error ? error.message : "unknown"
    }));
    return fail(c, 503, "SERVICE_UNAVAILABLE", "The API is not ready to serve traffic.", {
      status: "degraded",
      environment: c.env.AETHER_ENV ?? "development",
      checks: { d1: "error" },
      time
    });
  }

  return ok(c, {
    status: "ok",
    environment: c.env.AETHER_ENV ?? "development",
    checks: {
      d1: "ok",
      catalogSource: "local",
      stripeSandboxConfigured: Boolean(c.env.STRIPE_SECRET_KEY),
      stripeSecretKeyStatus: getStripeSecretKeyStatus(c.env.STRIPE_SECRET_KEY),
      resendConfigured: Boolean(c.env.RESEND_API_KEY)
    },
    time
  });
});
api.route("/catalog", catalogRoutes);
api.route("/", publicRoutes);
api.route("/", userRoutes);
api.route("/cart", cartRoutes);
api.route("/checkout", checkoutRoutes);
api.route("/contact", contactRoutes);
api.route("/admin", adminRoutes);
api.route("/account", accountRoutes);
api.route("/webhooks", webhookRoutes);

app.route("/", api);

export default app;
