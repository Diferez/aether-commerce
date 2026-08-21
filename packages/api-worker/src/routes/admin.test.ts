import { describe, expect, it } from "vitest";
import { __testables } from "./admin";

const { csvCell } = __testables;

describe("admin.csvCell (orders CSV export)", () => {
  it("renders null and undefined as an empty cell", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("passes plain strings and numbers through unquoted", () => {
    expect(csvCell("AETH-1234")).toBe("AETH-1234");
    expect(csvCell(3800)).toBe("3800");
  });

  it("quotes and escapes a value containing a comma", () => {
    expect(csvCell("Doe, John")).toBe('"Doe, John"');
  });

  it("quotes and doubles embedded double quotes", () => {
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
  });

  it("quotes a value containing a newline", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});
