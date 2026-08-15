// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { InlineMarkdown } from "./InlineMarkdown";

describe("InlineMarkdown", () => {
  it("renders **bold** as a <strong> element", () => {
    const { container } = render(<InlineMarkdown text="La orden **AETH-1** está lista." />);
    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe("AETH-1");
    expect(container.textContent).toBe("La orden AETH-1 está lista.");
  });

  it("renders *italic* as an <em> element", () => {
    const { container } = render(<InlineMarkdown text="Está *unfulfilled* ahora." />);
    const em = container.querySelector("em");
    expect(em?.textContent).toBe("unfulfilled");
  });

  it("renders `code` as a <code> element", () => {
    const { container } = render(<InlineMarkdown text="Usa `prepare_order_status_change`." />);
    const code = container.querySelector("code");
    expect(code?.textContent).toBe("prepare_order_status_change");
  });

  it("renders plain text with no markdown unchanged", () => {
    const { container } = render(<InlineMarkdown text="No hay formato aquí." />);
    expect(container.textContent).toBe("No hay formato aquí.");
    expect(container.querySelector("strong,em,code")).toBeNull();
  });

  it("never injects raw HTML - a stray < in model text stays literal text", () => {
    const { container } = render(<InlineMarkdown text="El precio es < 10 y **importante**." />);
    expect(container.querySelector("strong")?.textContent).toBe("importante");
    expect(container.textContent).toContain("< 10");
  });
});
