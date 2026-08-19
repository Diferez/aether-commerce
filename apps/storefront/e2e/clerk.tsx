"use client";

import type { ReactNode } from "react";

/** Local auth surface used only by the Playwright Webpack server. */
export function ClerkProvider({ children }: { children: ReactNode; publishableKey?: string; prefetchUI?: boolean }) {
  return <>{children}</>;
}

export function useAuth() {
  return { isLoaded: true, userId: null, sessionId: null, getToken: async () => null };
}

export function useUser() {
  return { isLoaded: true, user: null };
}

export function useClerk() {
  return { signOut: async (callback?: () => void) => callback?.() };
}

export function SignIn() { return null; }
export function SignUp() { return null; }
