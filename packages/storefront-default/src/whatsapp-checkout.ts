import { formatMoney } from "@aether-commerce/core";
import type { Cart } from "@aether-commerce/schemas";

// wa.me expects the phone with country code, digits only - no leading +,
// spaces or dashes (e.g. "573001234567" for Colombia). The admin-entered
// number is already validated to that shape server-side
// (isValidWhatsappNumber in @aether-commerce/core), this just guards against a stray
// character slipping through into the URL.
export function buildWhatsappUrl(phone: string, message: string): string {
  const digitsOnly = phone.replace(/\D/g, "");
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

// No store URL appended here (unlike buildProductWhatsappMessage below): the
// cart lives in the shopper's local storage, so a link to /cart/ would open
// to an empty cart in the store owner's own browser, not the shopper's -
// useless at best, confusing at worst. The itemized list and total below are
// the only thing the owner actually needs, and they're already inline.
export function buildCartWhatsappMessage(cart: Cart, locale: "en" | "es"): string {
  const numberLocale = locale === "es" ? "es-CO" : "en-US";
  const lines = cart.items.map(
    (item) =>
      `- ${item.name} x${item.quantity} (${formatMoney(item.lineTotal, item.currency, numberLocale)})`
  );
  const header =
    locale === "es"
      ? "Hola, me gustaria comprar estos productos:"
      : "Hi, I would like to buy these products:";
  const totalLabel = "Total";
  return [header, "", ...lines, "", `${totalLabel}: ${formatMoney(cart.totals.total, cart.totals.currency, numberLocale)}`].join("\n");
}

export function buildInquiryWhatsappMessage(locale: "en" | "es"): string {
  return locale === "es"
    ? "Hola, me gustaria consultar informacion sobre sus productos."
    : "Hi, I would like to ask about your products.";
}

export function buildProductWhatsappMessage(
  product: { name: string; finalPrice: number; currency: string },
  quantity: number,
  locale: "en" | "es",
  productUrl: string
): string {
  const numberLocale = locale === "es" ? "es-CO" : "en-US";
  const header =
    locale === "es"
      ? "Hola, me gustaria comprar este producto:"
      : "Hi, I would like to buy this product:";
  const productLabel = locale === "es" ? "Producto" : "Product";
  const priceLabel = locale === "es" ? "Precio" : "Price";
  const quantityLabel = locale === "es" ? "Cantidad" : "Quantity";
  return [
    header,
    "",
    `${productLabel}: ${product.name}`,
    `${priceLabel}: ${formatMoney(product.finalPrice, product.currency, numberLocale)}`,
    `${quantityLabel}: ${quantity}`,
    productUrl
  ].join("\n");
}
