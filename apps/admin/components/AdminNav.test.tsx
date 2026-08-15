// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminNav } from "./AdminNav";

let isSignedIn = true;
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn }),
  UserButton: () => <div data-testid="user-button" />
}));

describe("AdminNav", () => {
  it("renders the primary nav links with correct hrefs", () => {
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /products/i })).toHaveAttribute("href", "/products/");
    expect(screen.getByRole("link", { name: /inventory/i })).toHaveAttribute("href", "/inventory/");
    expect(screen.getByRole("link", { name: /^orders$/i })).toHaveAttribute("href", "/orders/");
    expect(screen.getByRole("link", { name: /customers/i })).toHaveAttribute("href", "/customers/");
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/settings/");
  });

  it("shows the UserButton when signed in", () => {
    isSignedIn = true;
    render(<AdminNav />);
    expect(screen.getByTestId("user-button")).toBeInTheDocument();
  });

  it("hides the UserButton when signed out", () => {
    isSignedIn = false;
    render(<AdminNav />);
    expect(screen.queryByTestId("user-button")).not.toBeInTheDocument();
  });
});
