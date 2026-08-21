// Admin-managed credentials for triggering a real production redeploy from
// the panel - same "persisted settings, encrypted at rest, admin-editable"
// shape as IntegrationSecretsService (integrations.ts), but kept as its own
// storage key/service/permission (platform.deploy, not settings.manage)
// since triggering a deploy is a materially higher-consequence action than
// saving a Resend or Cloudinary key.

export type PlatformDeployCredentials = {
  githubOwner?: string;
  githubRepo?: string;
  githubWorkflowFile?: string;
  githubPat?: string;
};

export type PlatformDeployCredentialsSummary = {
  configured: boolean;
  githubOwner: string | null;
  githubRepo: string | null;
  githubWorkflowFile: string | null;
  patConfigured: boolean;
};

/**
 * Storage port for the deploy credentials. The repository owns encryption of
 * whatever is at rest; this service only ever sees plaintext, same split as
 * IntegrationSecretsRepository.
 */
export interface PlatformDeploySettingsRepository {
  read(): Promise<PlatformDeployCredentials | null>;
  write(credentials: PlatformDeployCredentials): Promise<void>;
}

export type PlatformDeployCredentialsUpdate = Partial<PlatformDeployCredentials>;

function mergeCredentials(stored: PlatformDeployCredentials, fallback: PlatformDeployCredentials): PlatformDeployCredentials {
  const githubOwner = stored.githubOwner ?? fallback.githubOwner;
  const githubRepo = stored.githubRepo ?? fallback.githubRepo;
  const githubWorkflowFile = stored.githubWorkflowFile ?? fallback.githubWorkflowFile;
  const githubPat = stored.githubPat ?? fallback.githubPat;
  return {
    ...(githubOwner !== undefined ? { githubOwner } : {}),
    ...(githubRepo !== undefined ? { githubRepo } : {}),
    ...(githubWorkflowFile !== undefined ? { githubWorkflowFile } : {}),
    ...(githubPat !== undefined ? { githubPat } : {})
  };
}

/**
 * Resolves effective deploy credentials (persisted settings override a
 * deploy-time env-var fallback field by field) and exposes them as either
 * plaintext for the real GitHub API client, or a masked summary safe to
 * return to an admin client.
 */
export class PlatformDeploySettingsService {
  constructor(private readonly repository: PlatformDeploySettingsRepository) {}

  async get(fallback: PlatformDeployCredentials): Promise<PlatformDeployCredentials> {
    const stored = await this.repository.read();
    if (!stored) return fallback;
    return mergeCredentials(stored, fallback);
  }

  async summarize(fallback: PlatformDeployCredentials): Promise<PlatformDeployCredentialsSummary> {
    const credentials = await this.get(fallback);
    return {
      configured: Boolean(credentials.githubOwner && credentials.githubRepo && credentials.githubWorkflowFile && credentials.githubPat),
      githubOwner: credentials.githubOwner ?? null,
      githubRepo: credentials.githubRepo ?? null,
      githubWorkflowFile: credentials.githubWorkflowFile ?? null,
      patConfigured: Boolean(credentials.githubPat)
    };
  }

  /** Merges a partial update onto whatever is already persisted (not the fallback) and stores it. */
  async update(input: PlatformDeployCredentialsUpdate): Promise<void> {
    const current = (await this.repository.read()) ?? {};
    const next: PlatformDeployCredentials = {
      ...current,
      ...(input.githubOwner !== undefined ? { githubOwner: input.githubOwner } : {}),
      ...(input.githubRepo !== undefined ? { githubRepo: input.githubRepo } : {}),
      ...(input.githubWorkflowFile !== undefined ? { githubWorkflowFile: input.githubWorkflowFile } : {}),
      ...(input.githubPat !== undefined ? { githubPat: input.githubPat } : {})
    };
    await this.repository.write(next);
  }
}
