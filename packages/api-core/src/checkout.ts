import type { Cart } from "@aether/schemas";

/** Portable result returned by a hosted payment checkout. */
export type CheckoutRedirect = { checkoutUrl: string };

/** Minimum provider-neutral payment information needed to create an order. */
export type PaidCheckoutSession = {
  id: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  customer_details?: { email?: string };
  customer_email?: string;
  metadata?: { cartId?: string; userId?: string };
  payment_intent?: string;
};

/** Infrastructure boundary. Provider SDKs, HTTP clients and secrets stay in app adapters. */
export interface CheckoutProvider<TSession extends PaidCheckoutSession = PaidCheckoutSession> {
  createCheckoutSession(cart: Cart): Promise<CheckoutRedirect>;
  retrieveCheckoutSession(sessionId: string): Promise<TSession>;
}

export function isCheckoutSessionPaid(session: PaidCheckoutSession): boolean {
  return session.payment_status === "paid";
}

/** Creates application-owned return URLs without encoding a payment provider. */
export function createCheckoutReturnUrls(input: {
  origin: string;
  basePath?: string;
  cartId: string;
  successPath: string;
  cancelPath: string;
}): { successUrl: string; cancelUrl: string } {
  const origin = input.origin.replace(/\/$/, "");
  const basePath = input.basePath?.trim().replace(/^\/?/, "/").replace(/\/$/, "") ?? "";
  const withBase = (path: string) => `${origin}${basePath === "/" ? "" : basePath}${path.startsWith("/") ? path : `/${path}`}`;
  const encodedCart = encodeURIComponent(input.cartId);
  return {
    successUrl: withBase(`${input.successPath}${input.successPath.includes("?") ? "&" : "?"}cart=${encodedCart}`),
    cancelUrl: withBase(input.cancelPath)
  };
}
