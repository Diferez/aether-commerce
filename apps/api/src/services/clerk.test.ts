import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { updateUserRole, verifyClerkSignature } from "./clerk";

// Same Cloudflare-Workers-only WebCrypto extension gap as stripe.test.ts -
// crypto.subtle.timingSafeEqual isn't implemented by Node, only workerd.
beforeAll(() => {
  if (typeof crypto.subtle.timingSafeEqual !== "function") {
    crypto.subtle.timingSafeEqual = (a: BufferSource, b: BufferSource) => {
      const bufA = a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      const bufB = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      if (bufA.length !== bufB.length) return false;
      let diff = 0;
      for (let i = 0; i < bufA.length; i += 1) diff |= bufA[i]! ^ bufB[i]!;
      return diff === 0;
    };
  }
});

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

async function sign(secret: string, svixId: string, svixTimestamp: string, body: string) {
  const secretBytes = Uint8Array.from(atob(secret.slice(6)), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${svixId}.${svixTimestamp}.${body}`));
  return base64Encode(new Uint8Array(digest));
}

describe("verifyClerkSignature", () => {
  const secret = `whsec_${btoa("a-test-signing-key-32-bytes-long")}`;
  const svixId = "msg_test123";
  const svixTimestamp = "1700000000";
  const body = JSON.stringify({ type: "user.created", data: { id: "user_1" } });

  it("accepts a signature computed with the same secret", async () => {
    const sig = await sign(secret, svixId, svixTimestamp, body);
    expect(await verifyClerkSignature(secret, body, { svixId, svixTimestamp, svixSignature: `v1,${sig}` })).toBe(true);
  });

  it("accepts when the matching signature is one of several space-separated candidates", async () => {
    const sig = await sign(secret, svixId, svixTimestamp, body);
    const header = `v1,bm90dGhlcmlnaHRvbmU= v1,${sig}`;
    expect(await verifyClerkSignature(secret, body, { svixId, svixTimestamp, svixSignature: header })).toBe(true);
  });

  it("rejects a signature computed with a different secret", async () => {
    const otherSecret = `whsec_${btoa("a-different-signing-key-32-bytes")}`;
    const sig = await sign(otherSecret, svixId, svixTimestamp, body);
    expect(await verifyClerkSignature(secret, body, { svixId, svixTimestamp, svixSignature: `v1,${sig}` })).toBe(false);
  });

  it("rejects a signature computed over a different body", async () => {
    const sig = await sign(secret, svixId, svixTimestamp, body);
    const tamperedBody = JSON.stringify({ type: "user.created", data: { id: "user_evil" } });
    expect(await verifyClerkSignature(secret, tamperedBody, { svixId, svixTimestamp, svixSignature: `v1,${sig}` })).toBe(
      false
    );
  });

  it("rejects a malformed svix-signature header", async () => {
    expect(await verifyClerkSignature(secret, body, { svixId, svixTimestamp, svixSignature: "garbage" })).toBe(false);
  });
});

describe("updateUserRole", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok:false without calling fetch when CLERK_SECRET_KEY is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await updateUserRole({} as Env, "user_1", "admin");
    expect(result).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("PATCHes Clerk's metadata endpoint with the role replacing public_metadata.roles", async () => {
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      expect(url).toBe("https://api.clerk.com/v1/users/user_1/metadata");
      expect(init.method).toBe("PATCH");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk_test_123");
      expect(JSON.parse(init.body as string)).toEqual({ public_metadata: { roles: ["admin"] } });
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateUserRole({ CLERK_SECRET_KEY: "sk_test_123" } as Env, "user_1", "admin");
    expect(result).toEqual({ ok: true });
  });

  it("returns ok:false with the status when Clerk responds with an error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status: 422 }))));
    const result = await updateUserRole({ CLERK_SECRET_KEY: "sk_test_123" } as Env, "user_1", "admin");
    expect(result).toEqual({ ok: false, status: 422 });
  });

  it("returns ok:false when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down")))
    );
    const result = await updateUserRole({ CLERK_SECRET_KEY: "sk_test_123" } as Env, "user_1", "admin");
    expect(result).toEqual({ ok: false });
  });
});
