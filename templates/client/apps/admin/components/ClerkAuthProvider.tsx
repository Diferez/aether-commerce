"use client";

import { ClerkProvider } from "@clerk/react";

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

const clerkPublishableKey = requireEnv(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");

export function ClerkAuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ClerkProvider publishableKey={clerkPublishableKey}>{children}</ClerkProvider>;
}
