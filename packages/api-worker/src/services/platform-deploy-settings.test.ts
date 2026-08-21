import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { createPlatformDeploySettingsService, resolvePlatformDeployCredentials, summarizePlatformDeployCredentials } from "./platform-deploy-settings";

function fakeDb(row: { value_json: string } | null) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({ first: vi.fn(() => Promise.resolve(row)), run: vi.fn(() => Promise.resolve({ success: true })) })),
      first: vi.fn(() => Promise.resolve(row)),
      run: vi.fn(() => Promise.resolve({ success: true }))
    }))
  };
}

describe("createPlatformDeploySettingsService", () => {
  it("round-trips a written PAT through encryption", async () => {
    let stored: { value_json: string } | null = null;
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...args: unknown[]) => {
          if (sql.includes("insert into application_settings")) stored = { value_json: args[0] as string };
          return { run: vi.fn(() => Promise.resolve({ success: true })) };
        }),
        first: vi.fn(() => Promise.resolve(stored))
      }))
    } as unknown as D1Database;

    const service = createPlatformDeploySettingsService(db, "test-passphrase");
    await service.update({ githubOwner: "acme", githubRepo: "store", githubWorkflowFile: "deploy.yml", githubPat: "ghp_live_abc123" });

    expect(JSON.stringify(stored)).not.toContain("ghp_live_abc123");

    const result = await service.get({});
    expect(result).toEqual({ githubOwner: "acme", githubRepo: "store", githubWorkflowFile: "deploy.yml", githubPat: "ghp_live_abc123" });
  });

  it("ignores a stored row and falls back to env vars when the encryption key is missing", async () => {
    const db = fakeDb({ value_json: JSON.stringify({ githubPat: "ciphertext" }) });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const service = createPlatformDeploySettingsService(db as unknown as D1Database, undefined);
    const result = await service.get({ githubOwner: "env-owner" });

    expect(result).toEqual({ githubOwner: "env-owner" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("throws instead of silently storing plaintext when writing without an encryption key", async () => {
    const db = fakeDb(null);
    const service = createPlatformDeploySettingsService(db as unknown as D1Database, undefined);
    await expect(service.update({ githubPat: "ghp_x" })).rejects.toThrow(/AETHER_SETTINGS_ENCRYPTION_KEY/);
  });

  it("degrades to the env fallback instead of throwing when a stored PAT fails to decrypt", async () => {
    const db = fakeDb({ value_json: JSON.stringify({ githubPat: "not-valid-ciphertext" }) });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const service = createPlatformDeploySettingsService(db as unknown as D1Database, "test-passphrase");
    const result = await service.get({ githubPat: "env-fallback-pat" });

    expect(result.githubPat).toBe("env-fallback-pat");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("resolvePlatformDeployCredentials / summarizePlatformDeployCredentials", () => {
  it("resolves plaintext credentials for the real GitHub API client", async () => {
    const db = fakeDb(null);
    const env = {
      DB: db,
      PLATFORM_GITHUB_OWNER: "acme",
      PLATFORM_GITHUB_REPO: "store",
      PLATFORM_GITHUB_WORKFLOW_FILE: "deploy.yml",
      PLATFORM_GITHUB_PAT: "ghp_env",
      AETHER_SETTINGS_ENCRYPTION_KEY: "key"
    } as unknown as Env;

    expect(await resolvePlatformDeployCredentials(env)).toEqual({
      githubOwner: "acme",
      githubRepo: "store",
      githubWorkflowFile: "deploy.yml",
      githubPat: "ghp_env"
    });
  });

  it("never returns the PAT from the admin-facing summary", async () => {
    const db = fakeDb(null);
    const env = { DB: db, PLATFORM_GITHUB_PAT: "ghp_secret_value" } as unknown as Env;

    const summary = await summarizePlatformDeployCredentials(env);

    expect(summary.patConfigured).toBe(true);
    expect(JSON.stringify(summary)).not.toContain("ghp_secret_value");
  });

  it("reports configured: false until every field (owner, repo, workflow file, PAT) is present", async () => {
    const db = fakeDb(null);
    const env = { DB: db, PLATFORM_GITHUB_OWNER: "acme" } as unknown as Env;

    const summary = await summarizePlatformDeployCredentials(env);
    expect(summary.configured).toBe(false);
  });
});
