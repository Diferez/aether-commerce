"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { StorefrontLink } from "./StorefrontLink";

const noticeStorageKey = "aether.cookieNotice.v1";

export function CookieNotice() {
  const { locale } = useLanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.localStorage.getItem(noticeStorageKey) !== "dismissed");
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem(noticeStorageKey, "dismissed");
    setVisible(false);
  };

  return (
    <aside
      className="fixed left-1/2 top-20 z-40 w-[min(680px,calc(100vw-24px))] -translate-x-1/2 rounded-lg border border-border-strong bg-surface p-4 shadow-2xl"
      aria-label={locale === "es" ? "Aviso de cookies" : "Cookie notice"}
    >
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-sm leading-6 text-ink-muted">
          {locale === "es"
            ? "Aether usa almacenamiento funcional para la sesión, el carrito, el idioma y el tema. No usa publicidad ni analítica."
            : "Aether uses functional storage for the session, cart, language, and theme. It uses no advertising or analytics."}{" "}
          <StorefrontLink
            className="focus-ring font-semibold text-ink underline decoration-accent underline-offset-4"
            href="/cookies"
          >
            {locale === "es" ? "Ver detalle" : "View details"}
          </StorefrontLink>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"
          aria-label={locale === "es" ? "Cerrar aviso" : "Dismiss notice"}
        >
          <X size={17} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
