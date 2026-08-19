// Admin-managed credentials for third-party integrations this platform
// calls server-side (Resend for transactional email, Gemini for the admin
// chat assistant, Cloudinary for product image uploads) - same shape and
// same "persisted settings override a deploy-time env-var fallback, field
// by field" rule as CheckoutSettingsService (checkout.ts), just for a
// different set of providers. Kept as its own file rather than folded into
// checkout.ts since these providers have nothing to do with payments.

export type ResendCredentials = { apiKey?: string };
export type GeminiCredentials = { apiKey?: string };
export type CloudinaryCredentials = { cloudName?: string; apiKey?: string; apiSecret?: string };

export type IntegrationSecrets = {
  resend: ResendCredentials;
  gemini: GeminiCredentials;
  cloudinary: CloudinaryCredentials;
};

export type ResendCredentialsSummary = { configured: boolean; apiKeyPreview: string | null };
export type GeminiCredentialsSummary = { configured: boolean; apiKeyPreview: string | null };
export type CloudinaryCredentialsSummary = {
  configured: boolean;
  cloudName: string | null;
  apiKeyPreview: string | null;
  secretConfigured: boolean;
};

export type IntegrationSecretsSummary = {
  resend: ResendCredentialsSummary;
  gemini: GeminiCredentialsSummary;
  cloudinary: CloudinaryCredentialsSummary;
};

/**
 * Storage port for integration secrets. The repository owns encryption of
 * whatever is at rest; this service only ever sees plaintext, so neither
 * this type nor the service depends on a specific crypto scheme.
 */
export interface IntegrationSecretsRepository {
  read(): Promise<IntegrationSecrets | null>;
  write(secrets: IntegrationSecrets): Promise<void>;
}

export type IntegrationSecretsUpdate = {
  resend?: Partial<ResendCredentials>;
  gemini?: Partial<GeminiCredentials>;
  cloudinary?: Partial<CloudinaryCredentials>;
};

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "••••";
  return `${secret.slice(0, 6)}••••${secret.slice(-4)}`;
}

function mergeResend(stored: ResendCredentials, fallback: ResendCredentials): ResendCredentials {
  const apiKey = stored.apiKey ?? fallback.apiKey;
  return apiKey !== undefined ? { apiKey } : {};
}

function mergeGemini(stored: GeminiCredentials, fallback: GeminiCredentials): GeminiCredentials {
  const apiKey = stored.apiKey ?? fallback.apiKey;
  return apiKey !== undefined ? { apiKey } : {};
}

function mergeCloudinary(stored: CloudinaryCredentials, fallback: CloudinaryCredentials): CloudinaryCredentials {
  const cloudName = stored.cloudName ?? fallback.cloudName;
  const apiKey = stored.apiKey ?? fallback.apiKey;
  const apiSecret = stored.apiSecret ?? fallback.apiSecret;
  return {
    ...(cloudName !== undefined ? { cloudName } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(apiSecret !== undefined ? { apiSecret } : {})
  };
}

function summarizeResend(credentials: ResendCredentials): ResendCredentialsSummary {
  return { configured: Boolean(credentials.apiKey), apiKeyPreview: credentials.apiKey ? maskSecret(credentials.apiKey) : null };
}

function summarizeGemini(credentials: GeminiCredentials): GeminiCredentialsSummary {
  return { configured: Boolean(credentials.apiKey), apiKeyPreview: credentials.apiKey ? maskSecret(credentials.apiKey) : null };
}

function summarizeCloudinary(credentials: CloudinaryCredentials): CloudinaryCredentialsSummary {
  return {
    configured: Boolean(credentials.cloudName && credentials.apiKey && credentials.apiSecret),
    cloudName: credentials.cloudName ?? null,
    apiKeyPreview: credentials.apiKey ? maskSecret(credentials.apiKey) : null,
    secretConfigured: Boolean(credentials.apiSecret)
  };
}

/**
 * Resolves effective integration configuration (persisted settings override
 * a deploy-time fallback field by field) and exposes it as either plaintext
 * credentials for the real service adapters, or a masked summary safe to
 * return to an admin client.
 */
export class IntegrationSecretsService {
  constructor(private readonly repository: IntegrationSecretsRepository) {}

  async get(fallback: IntegrationSecrets): Promise<IntegrationSecrets> {
    const stored = await this.repository.read();
    if (!stored) return fallback;
    return {
      resend: mergeResend(stored.resend, fallback.resend),
      gemini: mergeGemini(stored.gemini, fallback.gemini),
      cloudinary: mergeCloudinary(stored.cloudinary, fallback.cloudinary)
    };
  }

  async summarize(fallback: IntegrationSecrets): Promise<IntegrationSecretsSummary> {
    const secrets = await this.get(fallback);
    return {
      resend: summarizeResend(secrets.resend),
      gemini: summarizeGemini(secrets.gemini),
      cloudinary: summarizeCloudinary(secrets.cloudinary)
    };
  }

  /** Merges a partial update onto whatever is already persisted (not the fallback) and stores it. */
  async update(input: IntegrationSecretsUpdate): Promise<void> {
    const current = (await this.repository.read()) ?? { resend: {}, gemini: {}, cloudinary: {} };
    const next: IntegrationSecrets = {
      resend: { ...current.resend, ...input.resend },
      gemini: { ...current.gemini, ...input.gemini },
      cloudinary: { ...current.cloudinary, ...input.cloudinary }
    };
    await this.repository.write(next);
  }
}
