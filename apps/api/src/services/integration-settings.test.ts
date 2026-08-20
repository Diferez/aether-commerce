import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { createIntegrationSettingsService, resolveIntegrationSecrets, summarizeIntegrationSecrets } from "./integration-settings";

function fakeDb(row: { value_json: string } | null) {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  return {
    db: {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...args: unknown[]) => {
          statements.push({ sql, args });
          return { first: vi.fn(() => Promise.resolve(row)), run: vi.fn(() => Promise.resolve({ success: true })) };
        }),
        first: vi.fn(() => Promise.resolve(row)),
        run: vi.fn(() => Promise.resolve({ success: true }))
      }))
    },
    statements
  };
}

describe("createIntegrationSettingsService", () => {
  it("round-trips a written secret through encryption", async () => {
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

    const service = createIntegrationSettingsService(db, "test-passphrase");
    await service.update({ resend: { apiKey: "re_live_abc123" } });

    expect(JSON.stringify(stored)).not.toContain("re_live_abc123");

    const result = await service.get({ resend: {}, gemini: {}, cloudinary: {} });
    expect(result.resend.apiKey).toBe("re_live_abc123");
  });

  it("ignores a stored row and falls back to env vars when the encryption key is missing", async () => {
    const { db } = fakeDb({ value_json: JSON.stringify({ resend: { apiKey: "ciphertext" } }) });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const service = createIntegrationSettingsService(db as unknown as D1Database, undefined);
    const result = await service.get({ resend: { apiKey: "re_env_fallback" }, gemini: {}, cloudinary: {} });

    expect(result).toEqual({ resend: { apiKey: "re_env_fallback" }, gemini: {}, cloudinary: {} });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("throws instead of silently storing plaintext when writing without an encryption key", async () => {
    const { db } = fakeDb(null);
    const service = createIntegrationSettingsService(db as unknown as D1Database, undefined);
    await expect(service.update({ resend: { apiKey: "re_live_x" } })).rejects.toThrow(/AETHER_SETTINGS_ENCRYPTION_KEY/);
  });

  it("degrades to the env fallback instead of throwing when a stored value fails to decrypt", async () => {
    const { db } = fakeDb({ value_json: JSON.stringify({ resend: { apiKey: "not-valid-ciphertext" } }) });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const service = createIntegrationSettingsService(db as unknown as D1Database, "test-passphrase");
    const result = await service.get({ resend: { apiKey: "re_env_fallback" }, gemini: {}, cloudinary: {} });

    expect(result.resend.apiKey).toBe("re_env_fallback");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("resolveIntegrationSecrets / summarizeIntegrationSecrets", () => {
  it("resolves plaintext credentials for real service adapters", async () => {
    const { db } = fakeDb(null);
    const env = { DB: db, RESEND_API_KEY: "re_env", AETHER_SETTINGS_ENCRYPTION_KEY: "key" } as unknown as Env;

    expect(await resolveIntegrationSecrets(env)).toEqual({
      resend: { apiKey: "re_env" },
      gemini: {},
      cloudinary: {}
    });
  });

  it("never returns plaintext from the admin-facing summary", async () => {
    const { db } = fakeDb(null);
    const env = { DB: db, RESEND_API_KEY: "re_env_secret_value" } as unknown as Env;

    const summary = await summarizeIntegrationSecrets(env);

    expect(summary.resend).toEqual({ configured: true, apiKeyPreview: "re_env••••alue" });
    expect(JSON.stringify(summary)).not.toContain("re_env_secret_value");
  });
});
