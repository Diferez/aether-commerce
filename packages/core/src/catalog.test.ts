import { describe, expect, it } from "vitest";
import { finalPriceFromDiscount, humanizeCategorySlug, slugify } from "./catalog";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Premium Wireless Mouse")).toBe("premium-wireless-mouse");
  });

  it("strips diacritics", () => {
    expect(slugify("Cafe Bombon Latte")).toBe("cafe-bombon-latte");
  });

  it("trims leading/trailing hyphens from punctuation", () => {
    expect(slugify("--Hello, World!--")).toBe("hello-world");
  });
});

describe("humanizeCategorySlug", () => {
  it("title-cases a plain slug", () => {
    expect(humanizeCategorySlug("laptops")).toBe("Laptops");
    expect(humanizeCategorySlug("home-decoration")).toBe("Home Decoration");
  });

  it("applies the apostrophe overrides for gendered category slugs", () => {
    expect(humanizeCategorySlug("mens-watches")).toBe("Men's Watches");
    expect(humanizeCategorySlug("womens-bags")).toBe("Women's Bags");
  });

  it("never changes the slug itself - only the display label", () => {
    const slug = "mens-watches";
    const label = humanizeCategorySlug(slug);
    expect(slug).toBe("mens-watches");
    expect(label).not.toBe(slug);
  });
});

describe("finalPriceFromDiscount", () => {
  it("applies a percentage discount to integer cents", () => {
    expect(finalPriceFromDiscount(10000, 10)).toBe(9000);
  });

  it("returns the original price when there is no discount", () => {
    expect(finalPriceFromDiscount(4999, 0)).toBe(4999);
  });
});
