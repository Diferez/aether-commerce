"use client";

import { ClerkProvider } from "@clerk/react";
import { storefrontPath } from "./config";

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

const clerkPublishableKey = requireEnv(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
);

// Clerk eagerly downloads its ~750KB <SignIn>/<SignUp> UI bundle on every
// page by default (prefetchUI defaults to true), even pages that never
// render those components. Every navigation here is a full page load (plain
// <a> hrefs, no client router), so it's safe to gate this purely on the
// current pathname - only /login and /register actually mount Clerk's UI.
function needsClerkUI(): boolean {
  if (typeof window === "undefined") return false;
  const pathname = window.location.pathname;
  return pathname === storefrontPath("/login") || pathname === storefrontPath("/register");
}

export function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} prefetchUI={needsClerkUI()}>
      {children}
    </ClerkProvider>
  );
}
