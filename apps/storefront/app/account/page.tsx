"use client";

import { Heart, LogOut, MapPin, PackageCheck, ShieldCheck, UserRound } from "lucide-react";
import { storefrontPath } from "../../components/config";
import { useCustomerSession, useSignOutCustomer } from "../../components/customer-client";
import { useLanguage } from "../../components/LanguageProvider";

export default function AccountPage() {
  const { t } = useLanguage();
  const { customer, isLoaded } = useCustomerSession();
  const signOut = useSignOutCustomer();

  function logout() {
    void signOut(() => {
      window.location.href = storefrontPath("/login");
    });
  }

  if (!isLoaded) {
    return null;
  }

  if (!customer) {
    return (
      <main className="aether-shell py-8">
        <section className="mx-auto max-w-2xl rounded-lg border border-zinc-200 bg-white p-6">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase text-teal-700">
            <UserRound size={17} aria-hidden />
            {t.customerAccount}
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-zinc-950">{t.signInRequired}</h1>
          <p className="mt-3 text-zinc-600">{t.accountRequiredDescription}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a href={storefrontPath("/login")} className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white">
              {t.signIn}
            </a>
            <a href={storefrontPath("/register")} className="focus-ring inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold">
              {t.createAccount}
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="aether-shell py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase text-teal-700">
            <UserRound size={17} aria-hidden />
            {t.account}
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-zinc-950">{t.hi}, {customer.name}</h1>
          <p className="mt-2 text-zinc-600">{customer.email}</p>
        </div>
        <button onClick={logout} className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold">
          <LogOut size={17} aria-hidden />
          {t.signOut}
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/account/favorites", icon: Heart, title: t.accountCards[0][0], body: t.accountCards[0][1] },
          { href: "/account/orders", icon: PackageCheck, title: t.accountCards[1][0], body: t.accountCards[1][1] },
          { href: "/account/addresses", icon: MapPin, title: t.accountCards[2][0], body: t.accountCards[2][1] },
          { href: "/account/reviews", icon: ShieldCheck, title: t.accountCards[3][0], body: t.accountCards[3][1] }
        ].map((item) => (
          <a key={item.href} href={storefrontPath(item.href)} className="rounded-lg border border-zinc-200 bg-white p-5 hover:border-teal-700">
            <item.icon className="text-teal-700" aria-hidden />
            <h2 className="mt-3 text-xl font-semibold text-zinc-950">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{item.body}</p>
          </a>
        ))}
      </div>
    </main>
  );
}
