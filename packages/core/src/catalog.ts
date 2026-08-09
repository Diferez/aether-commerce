import { applyPercentageDiscount } from "./money";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function cleanImageUrls(input: unknown, fallbackUrl: string): string[] {
  const values = Array.isArray(input) ? input : [];
  const cleaned = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().replaceAll("[", "").replaceAll("]", "").replace(/^["']+|["']+$/g, ""))
    .filter((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    });

  return cleaned.length > 0 ? [...new Set(cleaned)] : [fallbackUrl];
}

export function finalPriceFromDiscount(price: number, discountPercentage: number): number {
  return applyPercentageDiscount(price, discountPercentage);
}

const CATEGORY_NAME_OVERRIDES: Record<string, string> = {
  "mens-shirts": "Men's Shirts",
  "mens-shoes": "Men's Shoes",
  "mens-watches": "Men's Watches",
  "womens-bags": "Women's Bags",
  "womens-dresses": "Women's Dresses",
  "womens-jewellery": "Women's Jewellery",
  "womens-shoes": "Women's Shoes",
  "womens-watches": "Women's Watches",
  "mobile-accessories": "Mobile Accessories",
  "sports-accessories": "Sports Accessories",
  "home-decoration": "Home Decoration",
  "skin-care": "Skin Care"
};

/**
 * Category slugs are the identifier of record everywhere (filters, routes,
 * cache keys). This only produces a *display* label - never branch logic on
 * its output.
 */
export function humanizeCategorySlug(slug: string): string {
  const override = CATEGORY_NAME_OVERRIDES[slug];
  if (override) {
    return override;
  }

  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
