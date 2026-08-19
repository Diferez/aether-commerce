"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";
import { adminDictionaries, type Locale } from "@aether/i18n";

type AdminDictionary = (typeof adminDictionaries)[Locale];

type AdminLanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: AdminDictionary;
};

const AdminLanguageContext = createContext<AdminLanguageContextValue | null>(null);

// Own storage key, separate from the storefront's "aether.locale" - the
// admin operator and a storefront shopper are different audiences on
// different surfaces, no reason to couple their language preferences.
const STORAGE_KEY = "aether.admin.locale.v1";

function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "es") return stored;
  return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

// Same hydration-safe pattern as apps/storefront/components/LanguageProvider.tsx:
// starts at "en" unconditionally so the client's first render matches the
// server-rendered HTML exactly (SSR always resolves detectLocale() to "en"
// since window is undefined there) - detecting the real locale inside the
// useState initializer instead causes a text hydration mismatch (React
// error #418) for any operator whose stored/browser locale is "es". The
// real locale is applied right after mount, in a useLayoutEffect (not
// useEffect) so the correction lands before paint - combined with the
// data-locale-pending attribute set by the blocking inline script in
// app/layout.tsx (which hides <body> until this runs), that avoids ever
// painting the "en" default for an operator whose real locale is "es".
export function AdminLanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useLayoutEffect(() => {
    setLocaleState(detectLocale());
    document.documentElement.removeAttribute("data-locale-pending");
  }, []);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<AdminLanguageContextValue>(() => {
    return {
      locale,
      setLocale(nextLocale) {
        window.localStorage.setItem(STORAGE_KEY, nextLocale);
        document.documentElement.lang = nextLocale;
        setLocaleState(nextLocale);
      },
      t: adminDictionaries[locale]
    };
  }, [locale]);

  return <AdminLanguageContext.Provider value={value}>{children}</AdminLanguageContext.Provider>;
}

export function useAdminLanguage() {
  const context = useContext(AdminLanguageContext);
  if (!context) {
    throw new Error("useAdminLanguage must be used within AdminLanguageProvider");
  }
  return context;
}
