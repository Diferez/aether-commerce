import {
  PlatformDeploySettingsService,
  type PlatformDeployCredentials,
  type PlatformDeploySettingsRepository
} from "@aether-commerce/api-core";
import { decryptSecret, encryptSecret } from "@aether-commerce/core";
import type { Env } from "../types";

type StoredPlatformDeployCredentials = {
  githubOwner?: string;
  githubRepo?: string;
  githubWorkflowFile?: string;
  githubPat?: string;
};

async function encryptField(passphrase: string, value: string | undefined): Promise<string | undefined> {
  return value ? encryptSecret(passphrase, value) : undefined;
}

/**
 * Best-effort decrypt: a stored value that fails to decrypt (wrong/rotated
 * passphrase, corrupt row) is treated as absent rather than thrown, same as
 * integration-settings.ts's decryptField - a broken row degrades to "not
 * configured" instead of breaking the page.
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

function credentialsFrom(
  githubOwner: string | undefined,
  githubRepo: string | undefined,
  githubWorkflowFile: string | undefined,
  githubPat: string | undefined
): PlatformDeployCredentials {
  return {
    ...(githubOwner !== undefined ? { githubOwner } : {}),
    ...(githubRepo !== undefined ? { githubRepo } : {}),
    ...(githubWorkflowFile !== undefined ? { githubWorkflowFile } : {}),
    ...(githubPat !== undefined ? { githubPat } : {})
  };
}

/** D1 adapter for the admin-managed GitHub deploy credentials, PAT encrypted at rest. */
export function createPlatformDeploySettingsService(db: D1Database, encryptionKey: string | undefined): PlatformDeploySettingsService {
  const repository: PlatformDeploySettingsRepository = {
    async read() {
      const row = await db.prepare("select value_json from application_settings where key = 'platform_deploy'").first<{ value_json: string }>();
      if (!row) return null;
      if (!encryptionKey) {
        console.error("AETHER_SETTINGS_ENCRYPTION_KEY is not configured; ignoring stored platform deploy settings.");
        return null;
      }

      const stored = JSON.parse(row.value_json) as StoredPlatformDeployCredentials;
      return credentialsFrom(stored.githubOwner, stored.githubRepo, stored.githubWorkflowFile, await decryptField(encryptionKey, stored.githubPat, "GitHub PAT"));
    },

    async write(credentials) {
      if (!encryptionKey) {
        throw new Error("AETHER_SETTINGS_ENCRYPTION_KEY is not configured; cannot store platform deploy settings.");
      }

      const stored: StoredPlatformDeployCredentials = credentialsFrom(
        credentials.githubOwner,
        credentials.githubRepo,
        credentials.githubWorkflowFile,
        await encryptField(encryptionKey, credentials.githubPat)
      );
      await db
        .prepare(
          `insert into application_settings (key, value_json, updated_at) values ('platform_deploy', ?, CURRENT_TIMESTAMP)
           on conflict(key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at`
        )
        .bind(JSON.stringify(stored))
        .run();
    }
  };
  return new PlatformDeploySettingsService(repository);
}

function envFallback(env: Env): PlatformDeployCredentials {
  return credentialsFrom(env.PLATFORM_GITHUB_OWNER, env.PLATFORM_GITHUB_REPO, env.PLATFORM_GITHUB_WORKFLOW_FILE, env.PLATFORM_GITHUB_PAT);
}

/** Resolves effective deploy credentials (admin-managed D1 settings layered over deploy-time env vars) for the real GitHub API client to use. */
export async function resolvePlatformDeployCredentials(env: Env): Promise<PlatformDeployCredentials> {
  const service = createPlatformDeploySettingsService(env.DB, env.AETHER_SETTINGS_ENCRYPTION_KEY);
  return service.get(envFallback(env));
}

/** Masked view of effective deploy credentials for the admin panel. Never exposes the PAT. */
export async function summarizePlatformDeployCredentials(env: Env) {
  const service = createPlatformDeploySettingsService(env.DB, env.AETHER_SETTINGS_ENCRYPTION_KEY);
  return service.summarize(envFallback(env));
}
