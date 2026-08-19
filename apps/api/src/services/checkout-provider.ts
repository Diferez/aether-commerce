import { type CheckoutProvider, type CheckoutProviderId, type CheckoutSettings } from "@aether/api-core";
import type { Env } from "../types";
import { createCheckoutSettingsService } from "./checkout-settings";
import { createStripeCheckoutProvider } from "./stripe";
import { createWompiCheckoutProvider } from "./wompi";

function credentialsFrom(secretKey: string | undefined, webhookSecret: string | undefined) {
  return {
    ...(secretKey !== undefined ? { secretKey } : {}),
    ...(webhookSecret !== undefined ? { webhookSecret } : {})
  };
}

function envFallback(env: Env): CheckoutSettings {
  return {
    mode: "stripe",
    stripe: credentialsFrom(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET),
    wompi: credentialsFrom(env.WOMPI_SECRET_KEY, env.WOMPI_EVENTS_SECRET)
  };
}

/**
 * Resolves the active checkout provider from admin-managed settings (D1,
 * encrypted) layered over deploy-time env vars, and instantiates the matching
 * adapter. This is the one place routes need to know about to add a provider.
 */
export async function resolveCheckoutSettings(env: Env): Promise<CheckoutSettings> {
  const service = createCheckoutSettingsService(env.DB, env.AETHER_SETTINGS_ENCRYPTION_KEY);
  return service.get(envFallback(env));
}

export function createCheckoutProviderFor(env: Env, settings: CheckoutSettings): { mode: CheckoutProviderId; provider: CheckoutProvider } {
  if (settings.mode === "wompi") {
    return { mode: "wompi", provider: createWompiCheckoutProvider(env, settings.wompi) };
  }
  return { mode: "stripe", provider: createStripeCheckoutProvider(env, settings.stripe) };
}

/** Convenience for routes that just need "the currently active provider". */
export async function resolveActiveCheckoutProvider(env: Env) {
  const settings = await resolveCheckoutSettings(env);
  return createCheckoutProviderFor(env, settings);
}

/** Masked view of effective settings (DB overrides over env vars) for the admin panel. Never exposes plaintext secrets. */
export async function summarizeCheckoutSettings(env: Env) {
  const service = createCheckoutSettingsService(env.DB, env.AETHER_SETTINGS_ENCRYPTION_KEY);
  return service.summarize(envFallback(env));
}
