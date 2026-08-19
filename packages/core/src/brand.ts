export type BrandSettings = {
  name: string;
  tagline: { en: string; es: string };
  logoUrl: string;
  primaryColor: string;
  portfolioUrl: string;
  features: {
    reviews: boolean;
  };
};

export const defaultBrandSettings: BrandSettings = {
  name: "Aether",
  tagline: { en: "Technology, elevated.", es: "Tecnologia a otro nivel." },
  logoUrl: "",
  primaryColor: "#8b5cf6",
  portfolioUrl: "",
  features: {
    reviews: true
  }
};

// The storefront applies this directly as a CSS custom property value
// (--color-accent), so it has to be a value the browser accepts there -
// only hex is validated for admin input simplicity, though any valid CSS
// color would technically render fine.
export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}
