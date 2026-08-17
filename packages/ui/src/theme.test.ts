import { describe, expect, it } from "vitest";
import { themeTokensToCssVariables } from "./theme";

describe("theme token contract", () => {
  it("maps client-owned tokens to stable UI variables", () => {
    expect(themeTokensToCssVariables({
      primary: "#123456",
      secondary: "#654321",
      background: "#ffffff",
      surface: "#fafafa",
      text: "#111111",
      muted: "#666666",
      border: "#dddddd",
      radius: "12px",
      font: "system-ui"
    })).toContain("--color-accent: #123456;");
  });
});
