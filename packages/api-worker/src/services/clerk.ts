import type { Actor, Role } from "@aether-commerce/schemas";
import { OBSERVABILITY_EVENTS } from "@aether-commerce/core";
import type { Env } from "../types";
import { timingSafeEqualText } from "./secure-compare";
import { getLogger } from "./observability";

const SVIX_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export type ClerkEmailAddress = {
  id?: string;
  email_address?: string;
  verification?: {
    status?: string;
  };
};

export type ClerkUser = {
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
};

function cleanEmail(value: string | undefined) {
  const email = value?.trim();
  return email ? email : undefined;
}

export function primaryEmailFromUser(user: ClerkUser) {
  const emails = user.email_addresses ?? [];
  const primary =
    emails.find((email) => email.id === user.primary_email_address_id) ??
    emails.find((email) => email.verification?.status === "verified") ??
    emails[0];

  return cleanEmail(primary?.email_address);
}

export async function resolveActorEmail(env: Env, actor: Actor) {
  const claimEmail = cleanEmail(actor.email);
  if (claimEmail || !actor.userId || !env.CLERK_SECRET_KEY) {
    return claimEmail;
  }

  try {
    const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(actor.userId)}`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${env.CLERK_SECRET_KEY}`
      }
    });

    if (!response.ok) {
      getLogger(env).warn(OBSERVABILITY_EVENTS.externalApiFailed, { metadata: { service: "clerk", operation: "get_user", statusCode: response.status } });
      return undefined;
    }

    const user: ClerkUser = await response.json();
    return primaryEmailFromUser(user);
  } catch (error) {
    getLogger(env).warn(OBSERVABILITY_EVENTS.externalApiFailed, { metadata: { service: "clerk", operation: "get_user" }, error });
    return undefined;
  }
}

function base64Decode(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

// Clerk delivers webhooks through Svix, not Stripe's own signing scheme -
// different header names (svix-id/svix-timestamp/svix-signature), a
// base64 (not hex) secret and signature, and the signed content is
// "{id}.{timestamp}.{body}" rather than Stripe's "{timestamp}.{body}".
// See https://docs.svix.com/receiving/verifying-payloads/how-manual.
export async function verifyClerkSignature(
  secret: string,
  body: string,
  headers: { svixId: string; svixTimestamp: string; svixSignature: string }
): Promise<boolean> {
  const timestamp = Number(headers.svixTimestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > SVIX_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const secretValue = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const secretBytes = base64Decode(secretValue);
  const signedContent = `${headers.svixId}.${headers.svixTimestamp}.${body}`;

  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expected = base64Encode(new Uint8Array(digest));

  // svix-signature can carry multiple space-separated "v1,<sig>" values
  // (e.g. during a secret rotation) - valid if any of them match.
  const candidates = headers.svixSignature
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter((value): value is string => Boolean(value));

  if (candidates.length === 0) {
    return false;
  }

  const matches = await Promise.all(candidates.map((candidate) => timingSafeEqualText(expected, candidate)));
  return matches.some(Boolean);
}

// Roles are authorized entirely from Clerk's public_metadata (see
// middleware/auth.ts) - D1's users.roles_json is a mirror, not the source
// of truth. Changing a user's role for real means writing it back to
// Clerk, the same fetch/Bearer pattern already used above and in
// stripe.ts's createRefund. This replaces public_metadata.roles outright
// (assigns one role) rather than appending to it.
export async function updateUserRole(
  env: Env,
  clerkUserId: string,
  role: Role
): Promise<{ ok: boolean; status?: number }> {
  if (!env.CLERK_SECRET_KEY) {
    return { ok: false };
  }

  try {
    const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}/metadata`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.CLERK_SECRET_KEY}`
      },
      body: JSON.stringify({ public_metadata: { roles: [role] } })
    });

    if (!response.ok) {
      getLogger(env).warn(OBSERVABILITY_EVENTS.externalApiFailed, {
        metadata: { service: "clerk", operation: "update_role", statusCode: response.status }
      });
      return { ok: false, status: response.status };
    }

    return { ok: true };
  } catch (error) {
    getLogger(env).warn(OBSERVABILITY_EVENTS.externalApiFailed, { metadata: { service: "clerk", operation: "update_role" }, error });
    return { ok: false };
  }
}
