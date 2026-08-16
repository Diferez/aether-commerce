// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "../test/render";
import userEvent from "@testing-library/user-event";
import { WhatsappNumberInput } from "./WhatsappNumberInput";

function Controlled({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <WhatsappNumberInput value={value} onChange={setValue} />;
}

describe("WhatsappNumberInput", () => {
  it("defaults to Colombia (+57) with an empty local number when there is no value", () => {
    render(<WhatsappNumberInput value="" onChange={vi.fn()} />);
    expect(screen.getByText("+57")).toBeInTheDocument();
    expect(screen.getByLabelText(/whatsapp number, local part/i)).toHaveValue("");
  });

  it("splits an existing flat number into its country prefix and local part", () => {
    render(<WhatsappNumberInput value="573001234567" onChange={vi.fn()} />);
    expect(screen.getByText("+57")).toBeInTheDocument();
    expect(screen.getByLabelText(/whatsapp number, local part/i)).toHaveValue("3001234567");
  });

  it("splits a longer dial code correctly instead of matching a shorter overlapping prefix", () => {
    render(<WhatsappNumberInput value="18765551234" onChange={vi.fn()} />);
    // Jamaica is +1876, not US/Canada's +1 followed by local "8765551234".
    expect(screen.getByText("+1876")).toBeInTheDocument();
    expect(screen.getByLabelText(/whatsapp number, local part/i)).toHaveValue("5551234");
  });

  it("keeps the selected country prefix when the local number changes", async () => {
    const user = userEvent.setup();
    render(<Controlled initial="573001234567" />);
    const localInput = screen.getByLabelText(/whatsapp number, local part/i);
    await user.clear(localInput);
    await user.type(localInput, "3009999999");
    expect(screen.getByLabelText(/whatsapp number, local part/i)).toHaveValue("3009999999");
    expect(screen.getByText("+57")).toBeInTheDocument();
  });

  it("filters the country list by name and updates the prefix on selection, preserving the local number", async () => {
    const user = userEvent.setup();
    render(<Controlled initial="573001234567" />);
    await user.click(screen.getByRole("button", { name: /select country code/i }));
    await user.type(screen.getByLabelText(/search country/i), "Mexico");
    await user.click(await screen.findByRole("option", { name: /mexico/i }));
    expect(screen.getByText("+52")).toBeInTheDocument();
    expect(screen.getByLabelText(/whatsapp number, local part/i)).toHaveValue("3001234567");
  });

  it("copies the full E.164-style number to the clipboard", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const user = userEvent.setup();
    render(<WhatsappNumberInput value="573001234567" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /copy number/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("+573001234567"));
  });
});
