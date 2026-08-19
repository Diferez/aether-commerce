export type PaymentMode = "stripe" | "whatsapp";

export type CheckoutSettings = {
  paymentMode: PaymentMode;
  whatsappNumber: string;
  whatsappMessageTemplate: string;
};

export const defaultCheckoutSettings: CheckoutSettings = {
  paymentMode: "stripe",
  whatsappNumber: "",
  whatsappMessageTemplate: ""
};

// wa.me expects the number with country code, digits only - no +, spaces or
// dashes (e.g. "573001234567" for Colombia). Anything else silently fails to
// open a chat, so this is enforced wherever a number is accepted rather than
// left to whoever fills in the admin field.
export function isValidWhatsappNumber(value: string): boolean {
  return /^[1-9]\d{7,14}$/.test(value.trim());
}
