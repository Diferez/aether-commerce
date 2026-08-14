import { formatUsd } from "@aether/core";
import type { Cart } from "@aether/schemas";

// wa.me expects the phone with country code, digits only - no leading +,
// spaces or dashes (e.g. "573001234567" for Colombia). The admin-entered
// number is already validated to that shape server-side
// (isValidWhatsappNumber in @aether/core), this just guards against a stray
// character slipping through into the URL.
export function buildWhatsappUrl(phone: string, message: string): string {
  const digitsOnly = phone.replace(/\D/g, "");
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

export function buildCartWhatsappMessage(
  cart: Cart,
  locale: "en" | "es",
  storeUrl: string
): string {
  const numberLocale = locale === "es" ? "es-CO" : "en-US";
  const lines = cart.items.map(
    (item) =>
      `- ${item.name} x${item.quantity} (${formatUsd(item.lineTotal, numberLocale)})`
  );
  const header =
    locale === "es"
      ? "Hola, me gustaria comprar estos productos:"
      : "Hi, I would like to buy these products:";
  const totalLabel = locale === "es" ? "Total" : "Total";
  return [
    header,
    "",
    ...lines,
    "",
    `${totalLabel}: ${formatUsd(cart.totals.total, numberLocale)}`,
    storeUrl
  ].join("\n");
}

export function buildProductWhatsappMessage(
  product: { name: string; finalPrice: number },
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
    `${priceLabel}: ${formatUsd(product.finalPrice, numberLocale)}`,
    `${quantityLabel}: ${quantity}`,
    productUrl
  ].join("\n");
}
