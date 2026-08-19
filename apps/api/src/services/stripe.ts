import type { Cart } from "@aether/schemas";
import { type CheckoutProvider, type CheckoutProviderCredentials, type PaidCheckoutSession } from "@aether/api-core";
import type { Env } from "../types";
import { timingSafeEqualText } from "./secure-compare";

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

type StripeErrorLog = {
  type?: string;
  code?: string;
  message?: string;
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

/** Raw Stripe checkout.session shape, mapped into PaidCheckoutSession before leaving this module. */
type StripeSessionResponse = {
  id: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  customer_details?: { email?: string };
  customer_email?: string;
  metadata?: { cartId?: string; userId?: string };
  payment_intent?: string;
};

export function mapStripeSessionToPaidCheckoutSession(session: StripeSessionResponse): PaidCheckoutSession {
  return {
    id: session.id,
    status: !session.payment_status || session.payment_status === "paid" ? "paid" : "pending",
    ...(session.amount_total !== undefined ? { amountTotal: session.amount_total } : {}),
    ...(session.currency ? { currency: session.currency } : {}),
    ...(session.customer_details?.email || session.customer_email
      ? { customerEmail: session.customer_details?.email ?? session.customer_email }
      : {}),
    ...(session.metadata ? { metadata: session.metadata } : {}),
    ...(session.payment_intent ? { providerReference: session.payment_intent } : {})
  };
}

async function createStripeCheckoutSession(env: Env, secretKey: string | undefined, cart: Cart): Promise<{ checkoutUrl: string }> {
  const origin = env.APP_ORIGIN_STORE ?? "http://localhost:3000";
  const simulatedCheckout = {
    checkoutUrl: storefrontUrl(
      origin,
      env.APP_STORE_BASE_PATH,
      `/checkout/success?checkout=simulated&cart=${encodeURIComponent(cart.id)}`
    )
  };

  if (!secretKey) {
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
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: params
    });
  } catch (error) {
    if (env.AETHER_ENV !== "production") {
      console.info("Stripe checkout unavailable in development. Using simulated checkout.", {
        error: error instanceof Error ? error.name : "unknown"
      });
      return simulatedCheckout;
    }
    console.error("Stripe checkout request failed", {
      error: error instanceof Error ? error.name : "unknown"
    });
    throw new Error("Stripe session could not be created");
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const stripeError = parseStripeError(errorBody);
    if (env.AETHER_ENV !== "production") {
      console.info("Stripe checkout unavailable in development. Using simulated checkout.", {
        status: response.status,
        statusText: response.statusText,
        stripeError
      });
      return simulatedCheckout;
    }
    console.error("Stripe checkout failed", {
      status: response.status,
      statusText: response.statusText,
      stripeError
    });
    throw new Error("Stripe session could not be created");
  }

  const payload: unknown = await response.json();
  const checkoutUrl =
    payload && typeof payload === "object" && "url" in payload && typeof payload.url === "string"
      ? payload.url
      : storefrontUrl(origin, env.APP_STORE_BASE_PATH, "/cart?checkout=missing-url");
  return { checkoutUrl };
}

async function retrieveStripeCheckoutSession(secretKey: string | undefined, sessionId: string): Promise<PaidCheckoutSession> {
  if (!secretKey) {
    throw new Error("Stripe secret key is not configured");
  }

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      authorization: `Bearer ${secretKey}`
    }
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error("Stripe session retrieval failed", {
      status: response.status,
      statusText: response.statusText,
      stripeError: parseStripeError(errorBody)
    });
    throw new Error("Stripe session could not be retrieved");
  }

  return mapStripeSessionToPaidCheckoutSession(await response.json());
}

/** Cloudflare/Stripe adapter for the provider-neutral checkout port. Credentials fall back to env vars when omitted. */
export function createStripeCheckoutProvider(env: Env, credentials?: CheckoutProviderCredentials): CheckoutProvider {
  const secretKey = credentials?.secretKey ?? env.STRIPE_SECRET_KEY;
  return {
    createCheckoutSession: (cart) => createStripeCheckoutSession(env, secretKey, cart),
    retrieveCheckoutSession: (sessionId) => retrieveStripeCheckoutSession(secretKey, sessionId)
  };
}

/** @deprecated Use createStripeCheckoutProvider(env).createCheckoutSession(cart). */
export function createCheckoutSession(env: Env, cart: Cart) {
  return createStripeCheckoutProvider(env).createCheckoutSession(cart);
}

/** @deprecated Use createStripeCheckoutProvider(env).retrieveCheckoutSession(sessionId). */
export function retrieveCheckoutSession(env: Env, sessionId: string) {
  return createStripeCheckoutProvider(env).retrieveCheckoutSession(sessionId);
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
