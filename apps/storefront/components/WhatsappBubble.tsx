"use client";

import { MessageCircle } from "lucide-react";
import { useCheckoutOptions } from "./checkout-options";
import { useLanguage } from "./LanguageProvider";
import { buildInquiryWhatsappMessage, buildWhatsappUrl } from "./whatsapp-checkout";

// Permanent floating WhatsApp entry point, separate from the Aether AI
// assistant bubble (see AssistantWidget.tsx) - only shown when the store has
// WhatsApp checkout configured, so there's always a real number behind it.
export function WhatsappBubble() {
  const { locale } = useLanguage();
  const checkoutOptions = useCheckoutOptions();

  if (checkoutOptions?.paymentMode !== "whatsapp" || !checkoutOptions.whatsappNumber) {
    return null;
  }

  return (
    <a
      href={buildWhatsappUrl(checkoutOptions.whatsappNumber, buildInquiryWhatsappMessage(locale))}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-ring fixed right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition hover:-translate-y-0.5"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      aria-label={locale === "es" ? "Escribinos por WhatsApp" : "Chat with us on WhatsApp"}
    >
      <MessageCircle size={26} aria-hidden strokeWidth={2.25} />
    </a>
  );
}
