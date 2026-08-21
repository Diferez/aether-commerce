import type { Cart } from "@aether/schemas";
import { type CheckoutProvider, type CheckoutProviderCredentials, type PaidCheckoutSession, type WompiWebhookPayload } from "@aether/api-core";
import type { Env } from "../types";
import { timingSafeEqualText } from "./secure-compare";

type WompiErrorLog = {
  type?: string;
  reason?: string;
};

export function getWompiSecretKeyStatus(secretKey?: string) {
  if (!secretKey) {
    return "missing";
  }

  if (secretKey.startsWith("prv_test_")) {
    return "test_secret";
  }

  if (secretKey.startsWith("prv_prod_")) {
    return "live_secret";
  }

  if (secretKey.startsWith("pub_")) {
    return "publishable_key";
  }

  return "unknown";
}

/** Wompi scopes API base URL to the key's own environment; sandbox keys cannot call production. */
function wompiApiBase(secretKey: string) {
  return secretKey.startsWith("prv_prod_") ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
}

function parseWompiError(body: string): WompiErrorLog {
  try {
    const payload = JSON.parse(body) as { error?: { type?: string; reason?: string; messages?: unknown } };
    const reason = payload.error?.reason ?? (payload.error?.messages ? JSON.stringify(payload.error.messages) : undefined);
    return {
      ...(payload.error?.type !== undefined ? { type: payload.error.type } : {}),
      ...(reason !== undefined ? { reason } : {})
    };
  } catch {
    return { reason: body.slice(0, 180) };
  }
}

function storefrontUrl(origin: string, basePath: string | undefined, path: string) {
  const normalizedOrigin = origin.replace(/\/$/, "");
  const normalizedBasePath = basePath?.trim().replace(/^\/?/, "/").replace(/\/$/, "") ?? "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedOrigin}${normalizedBasePath === "/" ? "" : normalizedBasePath}${normalizedPath}`;
}

const WOMPI_STATUS_TO_NEUTRAL: Record<string, PaidCheckoutSession["status"]> = {
  APPROVED: "paid",
  PENDING: "pending",
  DECLINED: "failed",
  VOIDED: "failed",
  ERROR: "failed"
};

/** Raw Wompi transaction shape, mapped into PaidCheckoutSession before leaving this module. */
type WompiTransactionResponse = {
  id: string;
  status?: string;
  amount_in_cents?: number;
  currency?: string;
  reference?: string;
  customer_email?: string;
  payment_link_id?: string;
};

export function mapWompiTransactionToPaidCheckoutSession(transaction: WompiTransactionResponse): PaidCheckoutSession {
  const [cartId, userId, checkoutSnapshotId] = (transaction.reference ?? "").split("::");
  return {
    id: transaction.id,
    status: (transaction.status && WOMPI_STATUS_TO_NEUTRAL[transaction.status]) || "unknown",
    ...(transaction.amount_in_cents !== undefined ? { amountTotal: transaction.amount_in_cents } : {}),
    ...(transaction.currency ? { currency: transaction.currency } : {}),
    ...(transaction.customer_email ? { customerEmail: transaction.customer_email } : {}),
    ...(cartId
      ? { metadata: { cartId, ...(userId ? { userId } : {}), ...(checkoutSnapshotId ? { checkoutSnapshotId } : {}) } }
      : {}),
    providerReference: transaction.id
  };
}

// Encodes cartId/userId/checkoutSnapshotId into Wompi's single reference
// field (Wompi payment links have no free-form metadata). checkoutSnapshotId
// is how the immutable-snapshot integrity check (services/checkout-snapshots.ts,
// otherwise Stripe-only via session.metadata) reaches order creation for
// Wompi too - createOrderFromPaidSession refuses to fall back to the live
// cart, so without this a Wompi order could never be created at all.
function wompiReference(cart: Cart, checkoutSnapshotId: string): string {
  return `${cart.id}::${cart.userId ?? ""}::${checkoutSnapshotId}`;
}

// The CheckoutProvider port's createCheckoutSession also accepts a
// customerEmail (Stripe prefills its hosted checkout's email field with it);
// Wompi's payment_links API has no confirmed equivalent field, so this
// adapter intentionally never receives or sends it.
async function createWompiCheckoutSession(
  env: Env,
  secretKey: string | undefined,
  cart: Cart,
  checkoutSnapshotId: string
): Promise<{ checkoutUrl: string }> {
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

  const amountInCents = cart.items.reduce((total, item) => total + item.finalUnitPrice * item.quantity, 0);
  // Wompi's payment-link redirect appends ?id={transactionId}&env={env} to redirect_url on completion,
  // which is what /checkout/confirm treats as the sessionId to retrieve and confirm.
  const redirectUrl = storefrontUrl(
    origin,
    env.APP_STORE_BASE_PATH,
    `/checkout/success?checkout=success&cart=${encodeURIComponent(cart.id)}&provider=wompi`
  );

  let response: Response;
  try {
    response = await fetch(`${wompiApiBase(secretKey)}/payment_links`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: `${env.BRAND_NAME ?? "Aether"} cart ${cart.id}`,
        description: `${env.BRAND_NAME ?? "Aether"} checkout for cart ${cart.id}`,
        single_use: true,
        collect_shipping: false,
        currency: "COP",
        amount_in_cents: amountInCents,
        reference: wompiReference(cart, checkoutSnapshotId),
        redirect_url: redirectUrl
      })
    });
  } catch (error) {
    if (env.AETHER_ENV !== "production") {
      console.info("Wompi checkout unavailable in development. Using simulated checkout.", {
        error: error instanceof Error ? error.name : "unknown"
      });
      return simulatedCheckout;
    }
    console.error("Wompi checkout request failed", { error: error instanceof Error ? error.name : "unknown" });
    throw new Error("Wompi payment link could not be created");
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const wompiError = parseWompiError(errorBody);
    if (env.AETHER_ENV !== "production") {
      console.info("Wompi checkout unavailable in development. Using simulated checkout.", {
        status: response.status,
        statusText: response.statusText,
        wompiError
      });
      return simulatedCheckout;
    }
    console.error("Wompi checkout failed", { status: response.status, statusText: response.statusText, wompiError });
    throw new Error("Wompi payment link could not be created");
  }

  const payload: { data?: { id?: string } } = await response.json();
  const linkId = payload.data?.id;
  const checkoutUrl = linkId
    ? `https://checkout.wompi.co/l/${linkId}`
    : storefrontUrl(origin, env.APP_STORE_BASE_PATH, "/cart?checkout=missing-url");
  return { checkoutUrl };
}

async function retrieveWompiCheckoutSession(secretKey: string | undefined, transactionId: string): Promise<PaidCheckoutSession> {
  if (!secretKey) {
    throw new Error("Wompi secret key is not configured");
  }

  const response = await fetch(`${wompiApiBase(secretKey)}/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { authorization: `Bearer ${secretKey}` }
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error("Wompi transaction retrieval failed", {
      status: response.status,
      statusText: response.statusText,
      wompiError: parseWompiError(errorBody)
    });
    throw new Error("Wompi transaction could not be retrieved");
  }

  const payload: { data: WompiTransactionResponse } = await response.json();
  return mapWompiTransactionToPaidCheckoutSession(payload.data);
}

export type WompiRefund = {
  id: string;
  status?: string;
};

/**
 * Wompi's public API only exposes a full-transaction void
 * (POST /transactions/{id}/void), not a partial-amount refund like Stripe's
 * /v1/refunds - voiding reverses the entire charge. A partial amount is
 * rejected up front instead of silently voiding the full order, so the
 * admin isn't surprised by a mismatch between what they asked for and what
 * actually happened.
 */
export async function createWompiRefund(env: Env, transactionId: string, amountCents: number | undefined, orderTotalCents: number): Promise<WompiRefund> {
  const secretKey = env.WOMPI_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Wompi secret key is not configured");
  }
  if (amountCents !== undefined && amountCents < orderTotalCents) {
    throw new Error("Wompi only supports full refunds - partial refund amounts are not available for Wompi orders.");
  }

  const response = await fetch(`${wompiApiBase(secretKey)}/transactions/${encodeURIComponent(transactionId)}/void`, {
    method: "POST",
    headers: { authorization: `Bearer ${secretKey}` }
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error("Wompi refund (void) failed", {
      status: response.status,
      statusText: response.statusText,
      wompiError: parseWompiError(errorBody)
    });
    throw new Error("Wompi refund could not be created");
  }

  const payload: { data?: WompiTransactionResponse } = await response.json();
  return { id: payload.data?.id ?? transactionId, ...(payload.data?.status ? { status: payload.data.status } : {}) };
}

/** Cloudflare/Wompi adapter for the provider-neutral checkout port. Credentials fall back to env vars when omitted. */
export function createWompiCheckoutProvider(env: Env, credentials?: CheckoutProviderCredentials): CheckoutProvider {
  const secretKey = credentials?.secretKey ?? env.WOMPI_SECRET_KEY;
  return {
    createCheckoutSession: (cart, _customerEmail, checkoutSnapshotId) =>
      createWompiCheckoutSession(env, secretKey, cart, checkoutSnapshotId ?? ""),
    retrieveCheckoutSession: (transactionId) => retrieveWompiCheckoutSession(secretKey, transactionId)
  };
}

/**
 * Verifies a Wompi event webhook. Wompi signs by concatenating the values the
 * event names in signature.properties (dot-paths into `data`), the event
 * timestamp, and the shared events secret, then SHA-256 hashing the result -
 * a materially different scheme from Stripe's HMAC signature, which is
 * exactly the kind of provider-shaped difference the checkout port exists to
 * absorb behind one interface.
 */
export async function verifyWompiSignature(secret: string, event: WompiWebhookPayload): Promise<boolean> {
  const properties = event.signature?.properties;
  const checksum = event.signature?.checksum;
  if (!properties || !checksum || event.timestamp === undefined) {
    return false;
  }

  const values = properties.map((path) => {
    const segments = path.split(".");
    let cursor: unknown = event.data;
    for (const segment of segments.slice(1)) {
      if (cursor && typeof cursor === "object" && segment in cursor) {
        cursor = (cursor as Record<string, unknown>)[segment];
      } else {
        cursor = undefined;
        break;
      }
    }
    return typeof cursor === "string" || typeof cursor === "number" || typeof cursor === "boolean" ? String(cursor) : "";
  });

  const concatenated = `${values.join("")}${event.timestamp}${secret}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(concatenated));
  const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return timingSafeEqualText(actual, checksum.toLowerCase());
}
