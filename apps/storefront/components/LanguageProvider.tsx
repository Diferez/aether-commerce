"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";
import { dictionaries, type Locale } from "@aether/i18n";

type Dictionary = (typeof dictionaries)[Locale];

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Dictionary;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem("aether.locale");
  if (stored === "en" || stored === "es") return stored;
  return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Starts at "en" unconditionally so the client's first render matches the
  // server-rendered HTML exactly (the server always resolves detectLocale()
  // to "en" since window is undefined there). Detecting the real locale
  // inside the useState initializer instead causes a text hydration
  // mismatch (React error #418) for any client whose stored/browser locale
  // is "es". The real locale is applied right after mount instead.
  const [locale, setLocaleState] = useState<Locale>("en");

  // useLayoutEffect (not useEffect) so this correction lands before the
  // browser paints - combined with the data-locale-pending attribute set by
  // the blocking inline script in app/layout.tsx (which hides <body> until
  // this runs), that avoids ever painting the "en" default for clients whose
  // real locale is "es".
  useLayoutEffect(() => {
    setLocaleState(detectLocale());
    document.documentElement.removeAttribute("data-locale-pending");
  }, []);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LanguageContextValue>(() => {
    return {
      locale,
      setLocale(nextLocale) {
        window.localStorage.setItem("aether.locale", nextLocale);
        document.documentElement.lang = nextLocale;
        setLocaleState(nextLocale);
      },
      t: dictionaries[locale]
    };
  }, [locale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
