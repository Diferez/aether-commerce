"use client";

import { ClerkProvider } from "@clerk/react";
import { useEffect, useState } from "react";
import { apiBaseUrl, storefrontPath } from "./config";

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
  const [publishableKey, setPublishableKey] = useState(() =>
    isUsablePublishableKey(configuredClerkPublishableKey) ? configuredClerkPublishableKey : ""
  );
  const [configFailed, setConfigFailed] = useState(false);

  useEffect(() => {
    if (publishableKey) return;

    let active = true;
    fetch(`${apiBaseUrl}/api/v1/runtime-config`, {
      headers: { accept: "application/json" }
    })
      .then((response) => response.json() as Promise<RuntimeConfigPayload>)
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
      <div className="grid min-h-screen place-items-center bg-zinc-50 px-6 text-center text-zinc-700">
        <p>
          {configFailed
            ? "Authentication is not configured. Check the Aether API runtime config."
            : "Loading authentication..."}
        </p>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} prefetchUI={needsClerkUI()}>
      {children}
    </ClerkProvider>
  );
}
