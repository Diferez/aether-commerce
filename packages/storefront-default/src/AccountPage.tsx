"use client";

import { useRouter } from "next/navigation";
import { Heart, LogOut, PackageCheck, UserRound } from "lucide-react";
import { useCustomerSession, useSignOutCustomer } from "./customer-client";
import { useLanguage } from "./LanguageProvider";
import { StorefrontLink } from "./StorefrontLink";

export function AccountPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const { customer, isLoaded } = useCustomerSession();
  const signOut = useSignOutCustomer();

  function logout() {
    void signOut(() => {
      router.push("/login/");
    });
  }

  if (!isLoaded) {
    return null;
  }

  if (!customer) {
    return (
      <main className="aether-shell py-8">
        <section className="mx-auto max-w-2xl rounded-lg border border-border bg-surface p-6">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase text-accent-2">
            <UserRound size={17} aria-hidden />
            {t.customerAccount}
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-ink">{t.signInRequired}</h1>
          <p className="mt-3 text-ink-muted">{t.accountRequiredDescription}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <StorefrontLink href="/login" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white">
              {t.signIn}
            </StorefrontLink>
            <StorefrontLink href="/register" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold">
              {t.createAccount}
            </StorefrontLink>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="aether-shell py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase text-accent-2">
            <UserRound size={17} aria-hidden />
            {t.account}
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-ink">{t.hi}, {customer.name}</h1>
          <p className="mt-2 text-ink-muted">{customer.email}</p>
        </div>
        <button onClick={logout} className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold">
          <LogOut size={17} aria-hidden />
          {t.signOut}
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {[
          { href: "/account/favorites", icon: Heart, title: t.accountCards[0][0], body: t.accountCards[0][1] },
          { href: "/account/orders", icon: PackageCheck, title: t.accountCards[1][0], body: t.accountCards[1][1] }
        ].map((item) => (
          <StorefrontLink key={item.href} href={item.href} className="rounded-lg border border-border bg-surface p-5 hover:border-accent-2">
            <item.icon className="text-accent-2" aria-hidden />
            <h2 className="mt-3 text-xl font-semibold text-ink">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{item.body}</p>
          </StorefrontLink>
        ))}
      </div>
    </main>
  );
}
