import { describe, expect, it } from "vitest";
import { slugify } from "./products-admin";

describe("products-admin.slugify", () => {
  it("lowercases and hyphenates a plain name", () => {
    expect(slugify("Funda Slim Grip")).toBe("funda-slim-grip");
  });

  it("strips accents so slugs stay ASCII", () => {
    expect(slugify("Cámara Compacta")).toBe("camara-compacta");
  });

  it("collapses runs of non-alphanumeric characters into a single hyphen", () => {
    expect(slugify("Auriculares  --  Pro 2.0!!")).toBe("auriculares-pro-2-0");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  -Producto-  ")).toBe("producto");
  });

  it("caps length at 80 characters", () => {
    const long = "a".repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });
});
