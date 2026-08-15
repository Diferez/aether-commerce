// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "./page";

const getTokenMock = vi.fn(() => Promise.resolve(null));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: getTokenMock })
}));

const fetchMock = vi.fn();

const settingsRows = [
  { key: "brand", value_json: JSON.stringify({ name: "Aether Test", tagline: { en: "a", es: "b" }, logoUrl: "", primaryColor: "#111111", portfolioUrl: "", features: { reviews: true } }) },
  { key: "checkout", value_json: JSON.stringify({ paymentMode: "stripe", whatsappNumber: "", whatsappMessageTemplate: "" }) },
  { key: "shipping", value_json: JSON.stringify({ freeShippingThreshold: 15000, countries: ["US"], options: [] }) },
  { key: "reservations", value_json: JSON.stringify({ ttlMinutes: 15 }) }
];

function settingsResponse(rows = settingsRows) {
  return { json: () => Promise.resolve({ success: true, data: rows }) } as Response;
}

describe("SettingsPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows an error state when the initial load fails", async () => {
    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) } as Response);
    render(<SettingsPage />);
    expect(await screen.findByText(/could not load current settings/i)).toBeInTheDocument();
  });

  it("populates the four sections from the loaded settings", async () => {
    fetchMock.mockResolvedValueOnce(settingsResponse());
    render(<SettingsPage />);

    expect(await screen.findByDisplayValue("Aether Test")).toBeInTheDocument();
    expect(screen.getByLabelText(/free shipping threshold/i)).toHaveValue(150);
    expect(screen.getByLabelText(/reservation ttl/i)).toHaveValue(15);
  });

  it("saves the branding section", async () => {
    fetchMock.mockResolvedValueOnce(settingsResponse());
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByDisplayValue("Aether Test");

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) } as Response);
    await user.click(screen.getAllByRole("button", { name: /^save$/i })[0]!);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/settings/brand"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
    expect(await screen.findByText(/^saved\.$/i)).toBeInTheDocument();
  });

  it("saves the checkout section", async () => {
    fetchMock.mockResolvedValueOnce(settingsResponse());
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByDisplayValue("Aether Test");

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) } as Response);
    await user.click(screen.getAllByRole("button", { name: /^save$/i })[1]!);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/settings/checkout"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
  });

  it("saves the shipping section with the threshold converted to cents", async () => {
    fetchMock.mockResolvedValueOnce(settingsResponse());
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByDisplayValue("Aether Test");

    const thresholdInput = screen.getByLabelText(/free shipping threshold/i);
    fireEvent.change(thresholdInput, { target: { value: "200" } });

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) } as Response);
    await user.click(screen.getAllByRole("button", { name: /^save$/i })[2]!);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/settings/shipping"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/settings/shipping"));
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as { freeShippingThreshold: number };
    expect(body.freeShippingThreshold).toBe(20000);
  });

  it("saves the reservations section", async () => {
    fetchMock.mockResolvedValueOnce(settingsResponse());
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByDisplayValue("Aether Test");

    const ttlInput = screen.getByLabelText(/reservation ttl/i);
    fireEvent.change(ttlInput, { target: { value: "30" } });

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) } as Response);
    await user.click(screen.getAllByRole("button", { name: /^save$/i })[3]!);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/settings/reservations"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/settings/reservations"));
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as { ttlMinutes: number };
    expect(body).toEqual({ ttlMinutes: 30 });
  });

  it("shows an error note when a save fails", async () => {
    fetchMock.mockResolvedValueOnce(settingsResponse());
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByDisplayValue("Aether Test");

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) } as Response);
    await user.click(screen.getAllByRole("button", { name: /^save$/i })[0]!);

    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
  });
});
