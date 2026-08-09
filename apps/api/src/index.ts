import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppBindings } from "./types";
import { auth } from "./middleware/auth";
import { aetherCors } from "./middleware/cors";
import { errorBoundary } from "./middleware/errors";
import { rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { ok } from "./http";
import { accountRoutes } from "./routes/account";
import { adminRoutes } from "./routes/admin";
import { cartRoutes } from "./routes/cart";
import { catalogRoutes } from "./routes/catalog";
import { checkoutRoutes } from "./routes/checkout";
import { contactRoutes } from "./routes/contact";
import { publicRoutes } from "./routes/public";
import { userRoutes } from "./routes/user";
import { webhookRoutes } from "./routes/webhooks";
import { getStripeSecretKeyStatus } from "./services/stripe";

const app = new Hono<AppBindings>();

app.use("*", errorBoundary());
app.use("*", requestId());
app.use("*", secureHeaders());
app.use("*", aetherCors());
app.use("*", rateLimit());
app.use("*", auth());

app.get("/", (c) => ok(c, { name: "Aether API", version: "v1", basePath: "/api/v1" }));

const api = new Hono<AppBindings>().basePath("/api/v1");
api.get("/health", async (c) => {
  let d1 = "unknown";
  try {
    await c.env.DB.prepare("select 1 as ok").first();
    d1 = "ok";
  } catch {
    d1 = "error";
  }

  return ok(c, {
    status: "ok",
    environment: c.env.AETHER_ENV ?? "development",
    checks: {
      d1,
      catalogSource: "local",
      stripeSandboxConfigured: Boolean(c.env.STRIPE_SECRET_KEY),
      stripeSecretKeyStatus: getStripeSecretKeyStatus(c.env.STRIPE_SECRET_KEY),
      resendConfigured: Boolean(c.env.RESEND_API_KEY)
    },
    time: new Date().toISOString()
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
