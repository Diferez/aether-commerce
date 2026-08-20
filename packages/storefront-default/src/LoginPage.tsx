"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignIn } from "@clerk/react";
import { LogIn } from "lucide-react";
import { useStorefrontPath } from "./AetherStorefrontProvider";
import { useLanguage } from "./LanguageProvider";
import { useAetherAuth } from "./AetherAuthProvider";
import { clerkAppearance, resolveAuthNextPath } from "./clerk-appearance";

export function LoginPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const storefrontPath = useStorefrontPath();
  const { isAvailable, isLoaded, isSignedIn } = useAetherAuth();

  useEffect(() => {
    if (isSignedIn) {
      router.push(storefrontPath(resolveAuthNextPath()));
    }
  }, [isSignedIn, router]);

  return (
    <main className="aether-shell py-8">
      <section className="mx-auto max-w-xl rounded-lg border border-border bg-surface p-6">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase text-accent-2">
          <LogIn size={17} aria-hidden />
          {t.customerAccess}
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-ink">{t.signIn}</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">{t.loginDescription}</p>

        <div className="mt-6 flex justify-center">
          {isLoaded && !isAvailable ? (
            <div className="w-full rounded-md border border-amber-300 bg-amber-50 p-4 text-left text-amber-950" role="status">
              <p className="font-semibold">{t.authUnavailableTitle}</p>
              <p className="mt-1 text-sm">{t.authUnavailableDescription}</p>
            </div>
          ) : null}
          {isLoaded && isAvailable && !isSignedIn ? (
            <SignIn
              routing="hash"
              signUpUrl={storefrontPath("/register")}
              fallbackRedirectUrl={storefrontPath(resolveAuthNextPath())}
              appearance={clerkAppearance}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
