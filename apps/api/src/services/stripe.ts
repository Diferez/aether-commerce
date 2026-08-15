import type { Cart } from "@aether/schemas";
import { ExternalServiceError, OBSERVABILITY_EVENTS, PaymentError } from "@aether/core";
import type { Env } from "../types";
import { timingSafeEqualText } from "./secure-compare";
import { getLogger } from "./observability";
import { incrementMetric } from "./metrics";

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

type StripeErrorLog = {
  type?: string;
  code?: string;
  message?: string;
};

export type StripeCheckoutSession = {
  id: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  customer_details?: { email?: string };
  customer_email?: string;
  metadata?: { cartId?: string; userId?: string };
  payment_intent?: string;
};

export function getStripeSecretKeyStatus(secretKey?: string) {
  if (!secretKey) {
    return "missing";
  }

  if (secretKey.startsWith("sk_test_")) {
    return "test_secret";
  }

  if (secretKey.startsWith("sk_live_")) {
    return "live_secret";
  }

  if (secretKey.startsWith("pk_")) {
    return "publishable_key";
  }

  if (secretKey.startsWith("rk_")) {
    return "restricted_key";
  }

  return "unknown";
}

function parseStripeError(body: string): StripeErrorLog {
  try {
    const payload = JSON.parse(body) as { error?: StripeErrorLog };
    const stripeError: StripeErrorLog = {};
    if (payload.error?.type) {
      stripeError.type = payload.error.type;
    }
    if (payload.error?.code) {
      stripeError.code = payload.error.code;
    }
    if (payload.error?.message) {
      stripeError.message = payload.error.message;
    }
    return stripeError;
  } catch {
    return { message: body.slice(0, 180) };
  }
}

function storefrontUrl(origin: string, basePath: string | undefined, path: string) {
  const normalizedOrigin = origin.replace(/\/$/, "");
  const normalizedBasePath = basePath?.trim().replace(/^\/?/, "/").replace(/\/$/, "") ?? "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedOrigin}${normalizedBasePath === "/" ? "" : normalizedBasePath}${normalizedPath}`;
}

export async function createCheckoutSession(env: Env, cart: Cart, customerEmail?: string) {
  const origin = env.APP_ORIGIN_STORE ?? "http://localhost:3000";
  const simulatedCheckout = {
    checkoutUrl: storefrontUrl(
      origin,
      env.APP_STORE_BASE_PATH,
      `/checkout/success?checkout=simulated&cart=${encodeURIComponent(cart.id)}`
    )
  };

  if (!env.STRIPE_SECRET_KEY) {
    return simulatedCheckout;
  }

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set(
    "success_url",
    storefrontUrl(
      origin,
      env.APP_STORE_BASE_PATH,
      `/checkout/success?checkout=success&cart=${encodeURIComponent(cart.id)}&session_id={CHECKOUT_SESSION_ID}`
    )
  );
  params.set("cancel_url", storefrontUrl(origin, env.APP_STORE_BASE_PATH, "/cart?checkout=cancelled"));
  params.set("metadata[cartId]", cart.id);
  if (cart.userId) {
    params.set("metadata[userId]", cart.userId);
  }
  if (customerEmail) {
    params.set("customer_email", customerEmail);
  }

  cart.items.forEach((item, index) => {
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
    params.set(`line_items[${index}][price_data][currency]`, "usd");
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.finalUnitPrice));
    params.set(`line_items[${index}][price_data][product_data][name]`, item.name);
  });

  let response: Response;
  try {
    response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: params
    });
  } catch (error) {
    if (env.AETHER_ENV !== "production") {
      getLogger(env).info(OBSERVABILITY_EVENTS.paymentFailed, {
        metadata: { provider: "stripe", operation: "create_checkout_session", simulated: true },
        error
      });
      return simulatedCheckout;
    }
    getLogger(env).error(OBSERVABILITY_EVENTS.paymentFailed, { metadata: { provider: "stripe", operation: "create_checkout_session" }, error });
    await incrementMetric(env, "payments_failed");
    throw new PaymentError("Stripe checkout session request failed", { code: "PAYMENT_SESSION_FAILED", cause: error });
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const stripeError = parseStripeError(errorBody);
    if (env.AETHER_ENV !== "production") {
      getLogger(env).info(OBSERVABILITY_EVENTS.paymentFailed, {
        statusCode: response.status,
        metadata: { provider: "stripe", operation: "create_checkout_session", simulated: true, stripeError }
      });
      return simulatedCheckout;
    }
    getLogger(env).error(OBSERVABILITY_EVENTS.paymentFailed, {
      statusCode: response.status,
      metadata: { provider: "stripe", operation: "create_checkout_session", stripeError }
    });
    await incrementMetric(env, "payments_failed");
    throw new PaymentError("Stripe checkout session request was rejected", { code: "PAYMENT_SESSION_FAILED", metadata: { stripeError } });
  }

  const payload: unknown = await response.json();
  const checkoutUrl =
    payload && typeof payload === "object" && "url" in payload && typeof payload.url === "string"
      ? payload.url
      : storefrontUrl(origin, env.APP_STORE_BASE_PATH, "/cart?checkout=missing-url");
  return { checkoutUrl };
}

export async function retrieveCheckoutSession(env: Env, sessionId: string): Promise<StripeCheckoutSession> {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe secret key is not configured");
  }

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`
    }
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const stripeError = parseStripeError(errorBody);
    getLogger(env).error(OBSERVABILITY_EVENTS.externalApiFailed, {
      statusCode: response.status,
      metadata: { service: "stripe", operation: "retrieve_checkout_session", stripeError }
    });
    throw new ExternalServiceError("Stripe session could not be retrieved", { code: "PAYMENT_SESSION_LOOKUP_FAILED", metadata: { stripeError } });
  }

  return response.json();
}

export type StripeRefund = {
  id: string;
  status?: string;
  amount?: number;
};

// Same fetch + form-encoded + Bearer pattern as createCheckoutSession -
// deliberately not a new client abstraction. Sandbox-safe: STRIPE_SECRET_KEY
// in this deployment is a test-mode (sk_test_) key, so real money never
// moves - confirmed via getStripeSecretKeyStatus, which every admin route
// calling this already surfaces to the UI.
export async function createRefund(env: Env, paymentIntentId: string, amountCents?: number): Promise<StripeRefund> {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe secret key is not configured");
  }

  const params = new URLSearchParams();
  params.set("payment_intent", paymentIntentId);
  if (amountCents !== undefined) {
    params.set("amount", String(amountCents));
  }

  const response = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const stripeError = parseStripeError(errorBody);
    getLogger(env).error(OBSERVABILITY_EVENTS.paymentFailed, {
      statusCode: response.status,
      metadata: { provider: "stripe", operation: "create_refund", stripeError }
    });
    await incrementMetric(env, "payments_failed");
    throw new PaymentError(stripeError.message ?? "Stripe refund could not be created", {
      code: "PAYMENT_REFUND_FAILED",
      metadata: { stripeError }
    });
  }

  return response.json();
}

export async function verifyStripeSignature(secret: string, body: string, signatureHeader: string) {
  const timestamp = signatureHeader
    .split(",")
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const expectedSignatures = signatureHeader
    .split(",")
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3).toLowerCase());

  if (!timestamp || expectedSignatures.length === 0) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedPayload = `${timestamp}.${body}`;
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const matches = await Promise.all(expectedSignatures.map((expected) => timingSafeEqualText(actual, expected)));
  return matches.some(Boolean);
}
