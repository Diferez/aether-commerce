"use client";

import { ClerkProvider, useAuth, useClerk, useUser } from "@clerk/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiBaseUrl } from "./config";

export type AuthCustomer = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type AetherAuthContextValue = {
  customer: AuthCustomer | null;
  getToken: () => Promise<string | null>;
  isAvailable: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: (callback?: () => void) => Promise<void>;
};

const unavailableToken = () => Promise.resolve(null);
const unavailableSignOut = (callback?: () => void) => {
  callback?.();
  return Promise.resolve();
};

const AetherAuthContext = createContext<AetherAuthContextValue>({
  customer: null,
  getToken: unavailableToken,
  isAvailable: false,
  isLoaded: false,
  isSignedIn: false,
  signOut: unavailableSignOut
});

type RuntimeConfigPayload = {
  success?: boolean;
  data?: {
    clerkPublishableKey?: string | null;
  };
};

function decodedPublishableKeyHost(value: string) {
  try {
    const encoded = value.split("_")[2];
    return encoded ? atob(encoded).replace(/\$$/, "") : "";
  } catch {
    return "";
  }
}

function isUsablePublishableKey(value: string | undefined) {
  const key = value?.trim();
  if (!key) return false;
  if (!/^pk_(test|live)_/.test(key)) return false;
  return decodedPublishableKeyHost(key) !== "clerk.example.com";
}

const configuredClerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
const authDisabledForE2E = process.env.NEXT_PUBLIC_AETHER_E2E === "true";

function ClerkSessionBridge({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();

  const customer = useMemo<AuthCustomer | null>(() => {
    if (!isLoaded || !user?.id) return null;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    return {
      id: user.id,
      name: user.fullName?.trim() || email || "Account",
      email,
      createdAt: user.createdAt?.toISOString() ?? new Date().toISOString()
    };
  }, [isLoaded, user]);

  const signOutCustomer = useCallback(
    async (callback?: () => void) => {
      await signOut();
      callback?.();
    },
    [signOut]
  );

  const value = useMemo<AetherAuthContextValue>(
    () => ({
      customer,
      getToken,
      isAvailable: true,
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      signOut: signOutCustomer
    }),
    [customer, getToken, isLoaded, isSignedIn, signOutCustomer]
  );

  return <AetherAuthContext.Provider value={value}>{children}</AetherAuthContext.Provider>;
}

export function useAetherAuth() {
  return useContext(AetherAuthContext);
}

export function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  const [publishableKey, setPublishableKey] = useState(() =>
    isUsablePublishableKey(configuredClerkPublishableKey) ? configuredClerkPublishableKey : ""
  );
  const [configFailed, setConfigFailed] = useState(authDisabledForE2E);

  useEffect(() => {
    if (publishableKey || authDisabledForE2E) return;

    let active = true;
    fetch(`${apiBaseUrl}/api/v1/runtime-config`, {
      headers: { accept: "application/json" }
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Runtime configuration unavailable.");
        return response.json() as Promise<RuntimeConfigPayload>;
      })
      .then((payload) => {
        if (!active) return;
        const key = payload.data?.clerkPublishableKey?.trim();
        if (payload.success && isUsablePublishableKey(key)) {
          setPublishableKey(key);
          return;
        }
        setConfigFailed(true);
      })
      .catch(() => {
        if (active) setConfigFailed(true);
      });

    return () => {
      active = false;
    };
  }, [publishableKey]);

  if (!publishableKey) {
    return (
      <AetherAuthContext.Provider
        value={{
          customer: null,
          getToken: unavailableToken,
          isAvailable: false,
          isLoaded: configFailed,
          isSignedIn: false,
          signOut: unavailableSignOut
        }}
      >
        {children}
      </AetherAuthContext.Provider>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkSessionBridge>{children}</ClerkSessionBridge>
    </ClerkProvider>
  );
}
