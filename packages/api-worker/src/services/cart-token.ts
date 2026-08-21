import type { Env } from "../types";
import { timingSafeEqualText } from "./secure-compare";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64Url(new Uint8Array(signature));
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function createCartToken(env: Env, cartId: string) {
  const secret = env.AETHER_CART_TOKEN_SECRET;
  if (!secret) {
    throw new Error("Cart token secret is not configured.");
  }
  const payload = base64Url(
    encoder.encode(
      JSON.stringify({
        cartId,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24
      })
    )
  );
  const signature = await hmac(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyCartToken(env: Env, token: string | undefined, cartId: string) {
  const secret = env.AETHER_CART_TOKEN_SECRET;
  if (!secret || !token) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }

  const expectedSignature = await hmac(secret, payload);
  if (!(await timingSafeEqualText(signature, expectedSignature))) {
    return false;
  }

  try {
    const parsed = JSON.parse(decoder.decode(decodeBase64Url(payload))) as { cartId?: string; exp?: number };
    return parsed.cartId === cartId && Number(parsed.exp ?? 0) >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
