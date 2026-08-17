import { describe, expect, it } from "vitest";
import { interpolateTranslation, resolveLocale } from "./index";

describe("i18n platform helpers", () => {
  it("interpolates only known values without owning client copy", () => {
    expect(interpolateTranslation("Page {page} of {total}", { page: 2, total: 8 })).toBe("Page 2 of 8");
    expect(interpolateTranslation("Hello {name}", {})).toBe("Hello {name}");
  });

  it("uses the client-defined fallback locale", () => {
    expect(resolveLocale("es", ["en", "es"] as const, "en")).toBe("es");
    expect(resolveLocale("fr", ["en", "es"] as const, "en")).toBe("en");
  });
});
