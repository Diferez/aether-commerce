import type { Cart } from "@aether/schemas";

/** Portable result returned by a hosted payment checkout. sessionId is Stripe-only (returned so its immutable checkout snapshot can be bound to it). */
export type CheckoutRedirect = { checkoutUrl: string; sessionId?: string };

/** Provider-neutral payment status. Adapters map their own vocabulary onto this. */
export type CheckoutSessionStatus = "paid" | "pending" | "failed" | "unknown";

/** Minimum provider-neutral payment information needed to create an order. */
export type PaidCheckoutSession = {
  id: string;
  status: CheckoutSessionStatus;
  amountTotal?: number;
  currency?: string;
  customerEmail?: string;
  /** checkoutSnapshotId: Stripe-only immutable checkout snapshot binding (see apps/api/src/services/checkout-snapshots.ts). */
  metadata?: { cartId?: string; userId?: string; checkoutSnapshotId?: string };
  /** Provider-specific charge/transaction reference (Stripe payment_intent, Wompi transaction id, ...). */
  providerReference?: string;
};

/** Infrastructure boundary. Provider SDKs, HTTP clients and secrets stay in app adapters. */
export interface CheckoutProvider {
  /** checkoutSnapshotId is Stripe-only (see PaidCheckoutSession.metadata.checkoutSnapshotId); other adapters ignore it. */
  createCheckoutSession(cart: Cart, customerEmail?: string, checkoutSnapshotId?: string): Promise<CheckoutRedirect>;
  retrieveCheckoutSession(sessionId: string): Promise<PaidCheckoutSession>;
}

export function isCheckoutSessionPaid(session: PaidCheckoutSession): boolean {
  return session.status === "paid";
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

/** Supported checkout providers. Add a new id here plus an adapter to extend. */
export const checkoutProviderIds = ["stripe", "wompi"] as const;
export type CheckoutProviderId = (typeof checkoutProviderIds)[number];

/** Per-provider secret material. Never logged or returned to clients; only ever masked. */
export type CheckoutProviderCredentials = {
  secretKey?: string;
  webhookSecret?: string;
};

/** Persisted checkout configuration: which provider is active and each provider's credentials. */
export type CheckoutSettings = {
  mode: CheckoutProviderId;
  stripe: CheckoutProviderCredentials;
  wompi: CheckoutProviderCredentials;
};

export type CheckoutProviderCredentialsSummary = {
  configured: boolean;
  secretKeyPreview: string | null;
  webhookConfigured: boolean;
};

export type CheckoutSettingsSummary = {
  mode: CheckoutProviderId;
  stripe: CheckoutProviderCredentialsSummary;
  wompi: CheckoutProviderCredentialsSummary;
};

/**
 * Storage port for checkout configuration. The repository owns encryption of
 * whatever is at rest; this service only ever sees plaintext credentials, so
 * neither this type nor the service depends on a specific crypto scheme.
 */
export interface CheckoutSettingsRepository {
  read(): Promise<CheckoutSettings | null>;
  write(settings: CheckoutSettings): Promise<void>;
}

export type CheckoutSettingsUpdate = {
  mode?: CheckoutProviderId;
  stripe?: Partial<CheckoutProviderCredentials>;
  wompi?: Partial<CheckoutProviderCredentials>;
};

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "••••";
  return `${secret.slice(0, 6)}••••${secret.slice(-4)}`;
}

function summarizeCredentials(credentials: CheckoutProviderCredentials): CheckoutProviderCredentialsSummary {
  return {
    configured: Boolean(credentials.secretKey),
    secretKeyPreview: credentials.secretKey ? maskSecret(credentials.secretKey) : null,
    webhookConfigured: Boolean(credentials.webhookSecret)
  };
}

/**
 * Resolves effective checkout configuration (persisted settings override a
 * deploy-time fallback field by field) and exposes it as either plaintext
 * credentials for the checkout/webhook adapters, or a masked summary safe to
 * return to an admin client.
 */
function mergeCredentials(stored: CheckoutProviderCredentials, fallback: CheckoutProviderCredentials): CheckoutProviderCredentials {
  const secretKey = stored.secretKey ?? fallback.secretKey;
  const webhookSecret = stored.webhookSecret ?? fallback.webhookSecret;
  return {
    ...(secretKey !== undefined ? { secretKey } : {}),
    ...(webhookSecret !== undefined ? { webhookSecret } : {})
  };
}

export class CheckoutSettingsService {
  constructor(private readonly repository: CheckoutSettingsRepository) {}

  async get(fallback: CheckoutSettings): Promise<CheckoutSettings> {
    const stored = await this.repository.read();
    if (!stored) return fallback;
    return {
      mode: stored.mode ?? fallback.mode,
      stripe: mergeCredentials(stored.stripe, fallback.stripe),
      wompi: mergeCredentials(stored.wompi, fallback.wompi)
    };
  }

  async summarize(fallback: CheckoutSettings): Promise<CheckoutSettingsSummary> {
    const settings = await this.get(fallback);
    return {
      mode: settings.mode,
      stripe: summarizeCredentials(settings.stripe),
      wompi: summarizeCredentials(settings.wompi)
    };
  }

  /** Merges a partial update onto whatever is already persisted (not the fallback) and stores it. */
  async update(input: CheckoutSettingsUpdate): Promise<void> {
    const current = (await this.repository.read()) ?? { mode: "stripe" as CheckoutProviderId, stripe: {}, wompi: {} };
    const next: CheckoutSettings = {
      mode: input.mode ?? current.mode,
      stripe: { ...current.stripe, ...input.stripe },
      wompi: { ...current.wompi, ...input.wompi }
    };
    await this.repository.write(next);
  }
}
