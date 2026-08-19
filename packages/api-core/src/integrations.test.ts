import { describe, expect, it } from "vitest";
import { IntegrationSecretsService, type IntegrationSecrets, type IntegrationSecretsRepository } from "./integrations";

function fakeRepository(initial: IntegrationSecrets | null = null): IntegrationSecretsRepository & { stored: IntegrationSecrets | null } {
  const state: { value: IntegrationSecrets | null } = { value: initial };
  return {
    get stored() {
      return state.value;
    },
    read: () => Promise.resolve(state.value),
    write: (secrets) => {
      state.value = secrets;
      return Promise.resolve();
    }
  };
}

const envFallback: IntegrationSecrets = {
  resend: { apiKey: "re_env_fallback" },
  gemini: { apiKey: "AIza_env_fallback" },
  cloudinary: { cloudName: "env-cloud", apiKey: "env-key", apiSecret: "env-secret" }
};

describe("integration secrets service", () => {
  it("falls back to env-var settings when nothing is stored", async () => {
    const service = new IntegrationSecretsService(fakeRepository(null));
    expect(await service.get(envFallback)).toEqual(envFallback);
  });

  it("prefers a stored credential over the env fallback, field by field", async () => {
    const repository = fakeRepository({
      resend: { apiKey: "re_stored_override" },
      gemini: {},
      cloudinary: { apiKey: "stored-key" }
    });
    const service = new IntegrationSecretsService(repository);

    expect(await service.get(envFallback)).toEqual({
      resend: { apiKey: "re_stored_override" },
      gemini: { apiKey: "AIza_env_fallback" },
      cloudinary: { cloudName: "env-cloud", apiKey: "stored-key", apiSecret: "env-secret" }
    });
  });

  it("merges a partial update onto what is already stored, not onto the fallback", async () => {
    const repository = fakeRepository({ resend: { apiKey: "re_original" }, gemini: {}, cloudinary: {} });
    const service = new IntegrationSecretsService(repository);

    await service.update({ gemini: { apiKey: "AIza_new" } });

    expect(repository.stored).toEqual({
      resend: { apiKey: "re_original" },
      gemini: { apiKey: "AIza_new" },
      cloudinary: {}
    });
  });

  it("summarizes without ever exposing a plaintext secret", async () => {
    const service = new IntegrationSecretsService(
      fakeRepository({
        resend: { apiKey: "re_test_abc12345" },
        gemini: {},
        cloudinary: { cloudName: "demo", apiKey: "1234567890", apiSecret: "super-secret-value" }
      })
    );

    const summary = await service.summarize({ resend: {}, gemini: {}, cloudinary: {} });

    expect(summary).toEqual({
      resend: { configured: true, apiKeyPreview: "re_tes••••2345" },
      gemini: { configured: false, apiKeyPreview: null },
      cloudinary: { configured: true, cloudName: "demo", apiKeyPreview: "123456••••7890", secretConfigured: true }
    });
    expect(JSON.stringify(summary)).not.toContain("super-secret-value");
    expect(JSON.stringify(summary)).not.toContain("re_test_abc12345");
  });
});
