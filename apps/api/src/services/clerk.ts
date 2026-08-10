import type { Actor } from "@aether/schemas";
import type { Env } from "../types";

type ClerkEmailAddress = {
  id?: string;
  email_address?: string;
  verification?: {
    status?: string;
  };
};

type ClerkUser = {
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
};

function cleanEmail(value: string | undefined) {
  const email = value?.trim();
  return email ? email : undefined;
}

function primaryEmailFromUser(user: ClerkUser) {
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
      console.warn("Clerk user email lookup failed", { status: response.status });
      return undefined;
    }

    const user: ClerkUser = await response.json();
    return primaryEmailFromUser(user);
  } catch (error) {
    console.warn("Clerk user email lookup failed", {
      error: error instanceof Error ? error.name : "unknown"
    });
    return undefined;
  }
}
