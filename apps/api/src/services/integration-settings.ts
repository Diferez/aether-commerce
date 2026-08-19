import { IntegrationSecretsService, type IntegrationSecrets, type IntegrationSecretsRepository } from "@aether/api-core";
import { decryptSecret, encryptSecret } from "@aether/core";
import type { Env } from "../types";

type StoredIntegrationSecrets = {
  resend?: { apiKey?: string };
  gemini?: { apiKey?: string };
  cloudinary?: { cloudName?: string; apiKey?: string; apiSecret?: string };
};

async function encryptField(passphrase: string, value: string | undefined): Promise<string | undefined> {
  return value ? encryptSecret(passphrase, value) : undefined;
}

/** exactOptionalPropertyTypes rejects `{ apiKey: string | undefined }` for an optional `apiKey?: string` field - these only ever include a key when it actually has a value, same as checkout-provider.ts's credentialsFrom. */
function resendFrom(apiKey: string | undefined) {
  return { ...(apiKey !== undefined ? { apiKey } : {}) };
}

function geminiFrom(apiKey: string | undefined) {
  return { ...(apiKey !== undefined ? { apiKey } : {}) };
}

function cloudinaryFrom(cloudName: string | undefined, apiKey: string | undefined, apiSecret: string | undefined) {
  return {
    ...(cloudName !== undefined ? { cloudName } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(apiSecret !== undefined ? { apiSecret } : {})
  };
}

/**
 * Best-effort decrypt: a stored value that fails to decrypt (wrong/rotated
 * passphrase, corrupt row) is treated as absent rather than thrown, so a
 * broken settings row degrades to the env-var fallback instead of breaking
 * email/uploads/admin chat for everyone.
 */
async function decryptField(passphrase: string, value: string | undefined, label: string): Promise<string | undefined> {
  if (!value) return undefined;
  try {
    return await decryptSecret(passphrase, value);
  } catch (error) {
    console.error(`Could not decrypt stored ${label}`, { error: error instanceof Error ? error.name : "unknown" });
    return undefined;
  }
}

/** D1 adapter for admin-managed integration secrets (Resend, Gemini, Cloudinary), encrypted at rest. */
export function createIntegrationSettingsService(db: D1Database, encryptionKey: string | undefined): IntegrationSecretsService {
  const repository: IntegrationSecretsRepository = {
    async read() {
      const row = await db.prepare("select value_json from application_settings where key = 'integrations'").first<{ value_json: string }>();
      if (!row) return null;
      if (!encryptionKey) {
        console.error("AETHER_SETTINGS_ENCRYPTION_KEY is not configured; ignoring stored integration secrets.");
        return null;
      }

      const stored = JSON.parse(row.value_json) as StoredIntegrationSecrets;
      return {
        resend: resendFrom(await decryptField(encryptionKey, stored.resend?.apiKey, "Resend API key")),
        gemini: geminiFrom(await decryptField(encryptionKey, stored.gemini?.apiKey, "Gemini API key")),
        // Cloud name identifies the account but isn't secret on its own
        // (it's part of every public asset URL) - only the key/secret pair
        // are encrypted.
        cloudinary: cloudinaryFrom(
          stored.cloudinary?.cloudName,
          await decryptField(encryptionKey, stored.cloudinary?.apiKey, "Cloudinary API key"),
          await decryptField(encryptionKey, stored.cloudinary?.apiSecret, "Cloudinary API secret")
        )
      } satisfies IntegrationSecrets;
    },

    async write(secrets) {
      if (!encryptionKey) {
        throw new Error("AETHER_SETTINGS_ENCRYPTION_KEY is not configured; cannot store integration secrets.");
      }

      const stored: StoredIntegrationSecrets = {
        resend: resendFrom(await encryptField(encryptionKey, secrets.resend.apiKey)),
        gemini: geminiFrom(await encryptField(encryptionKey, secrets.gemini.apiKey)),
        cloudinary: cloudinaryFrom(
          secrets.cloudinary.cloudName,
          await encryptField(encryptionKey, secrets.cloudinary.apiKey),
          await encryptField(encryptionKey, secrets.cloudinary.apiSecret)
        )
      };
      await db
        .prepare(
          `insert into application_settings (key, value_json, updated_at) values ('integrations', ?, CURRENT_TIMESTAMP)
           on conflict(key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at`
        )
        .bind(JSON.stringify(stored))
        .run();
    }
  };
  return new IntegrationSecretsService(repository);
}

function envFallback(env: Env): IntegrationSecrets {
  return {
    resend: resendFrom(env.RESEND_API_KEY),
    gemini: geminiFrom(env.GEMINI_API_KEY),
    cloudinary: cloudinaryFrom(env.CLOUDINARY_CLOUD_NAME, env.CLOUDINARY_API_KEY, env.CLOUDINARY_API_SECRET)
  };
}

/** Resolves effective integration secrets (admin-managed D1 settings layered over deploy-time env vars) for the real service adapters to use. */
export async function resolveIntegrationSecrets(env: Env): Promise<IntegrationSecrets> {
  const service = createIntegrationSettingsService(env.DB, env.AETHER_SETTINGS_ENCRYPTION_KEY);
  return service.get(envFallback(env));
}

/** Masked view of effective integration secrets for the admin panel. Never exposes plaintext. */
export async function summarizeIntegrationSecrets(env: Env) {
  const service = createIntegrationSettingsService(env.DB, env.AETHER_SETTINGS_ENCRYPTION_KEY);
  return service.summarize(envFallback(env));
}
