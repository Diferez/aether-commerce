import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { createUploadSignature, sha1Hex } from "./cloudinary";

// createUploadSignature resolves its credentials via integration-settings.ts
// (D1-backed, admin-managed settings layered over these env vars) - a bare
// D1 mock returning "no row" so these tests exercise the plain env-var
// fallback path, same as before that resolution layer existed.
function fakeEnv(overrides: Partial<Env> = {}): Env {
  const db = { prepare: vi.fn(() => ({ first: vi.fn(() => Promise.resolve(null)) })) };
  return { DB: db, ...overrides } as unknown as Env;
}

describe("cloudinary.sha1Hex", () => {
  // Standard, independently-published SHA-1 test vectors (FIPS 180-1) - not
  // Cloudinary-specific, just confirming the hashing primitive itself is
  // correct. The full signing scheme (param ordering, api_secret placement)
  // was verified separately against the real Cloudinary API with real
  // credentials during manual testing of this feature.
  it("matches the known SHA-1 digest of an empty string", async () => {
    expect(await sha1Hex("")).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
  });

  it("produces a deterministic 40-char hex digest for 'abc'", async () => {
    const digest = await sha1Hex("abc");
    expect(digest).toMatch(/^[0-9a-f]{40}$/);
    expect(digest).toBe(await sha1Hex("abc"));
  });
});

describe("cloudinary.createUploadSignature", () => {
  it("returns null when any credential is missing", async () => {
    expect(await createUploadSignature(fakeEnv())).toBeNull();
    expect(await createUploadSignature(fakeEnv({ CLOUDINARY_CLOUD_NAME: "demo" }))).toBeNull();
    expect(
      await createUploadSignature(fakeEnv({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key" }))
    ).toBeNull();
  });

  it("returns a well-formed signature when all credentials are present", async () => {
    const env = fakeEnv({
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "123456",
      CLOUDINARY_API_SECRET: "secret"
    });
    const result = await createUploadSignature(env);
    expect(result).not.toBeNull();
    expect(result?.cloudName).toBe("demo");
    expect(result?.apiKey).toBe("123456");
    expect(result?.folder).toBe("aether/products");
    expect(result?.signature).toMatch(/^[0-9a-f]{40}$/);
  });

  it("never lets the api_secret leak into the returned signature payload", async () => {
    const env = fakeEnv({
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "123456",
      CLOUDINARY_API_SECRET: "super-secret-value"
    });
    const result = await createUploadSignature(env);
    expect(JSON.stringify(result)).not.toContain("super-secret-value");
  });
});
