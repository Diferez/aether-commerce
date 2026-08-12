"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignIn } from "@clerk/react";
import { LogIn } from "lucide-react";
import { storefrontPath } from "../../components/config";
import { useLanguage } from "../../components/LanguageProvider";
import { useAetherAuth } from "../../components/ClerkAuthProvider";

const clerkAppearance = {
  variables: {
    colorPrimary: "var(--color-accent)",
    colorBackground: "var(--color-surface)",
    colorText: "var(--color-ink)",
    colorTextSecondary: "var(--color-ink-muted)",
    colorInputBackground: "var(--color-surface)",
    colorInputText: "var(--color-ink)",
    borderRadius: "0.375rem"
  },
  elements: {
    card: "shadow-none border border-border bg-surface",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
    socialButtonsBlockButton: "border border-border",
    dividerLine: "bg-border",
    footerActionLink: "text-accent hover:text-accent-hover"
  }
};

export default function LoginPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const { isAvailable, isLoaded, isSignedIn } = useAetherAuth();

  function nextPath() {
    if (typeof window === "undefined") return "/account";
    const next = new URLSearchParams(window.location.search).get("next");
    return next?.startsWith("/") ? next : "/account";
  }

  useEffect(() => {
    if (isSignedIn) {
      router.push(storefrontPath(nextPath()));
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
              fallbackRedirectUrl={storefrontPath(nextPath())}
              appearance={clerkAppearance}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
