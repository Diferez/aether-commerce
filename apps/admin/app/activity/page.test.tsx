// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivityPage from "./page";

const getTokenMock = vi.fn(() => Promise.resolve(null));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: getTokenMock })
}));

const fetchMock = vi.fn();

const sampleEntries = [
  { id: "log_1", actor_id: "usr_admin", action: "product.created", target_type: "product", target_id: "prd_1", payload_json: "{}", created_at: "2026-01-02T00:00:00.000Z" },
  { id: "log_2", actor_id: "usr_admin", action: "settings.updated", target_type: "settings", target_id: "shipping", payload_json: "{}", created_at: "2026-01-01T00:00:00.000Z" }
];

function listResponse(data: unknown[] = sampleEntries) {
  return { json: () => Promise.resolve({ success: true, data }) } as Response;
}

describe("ActivityPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows an empty state when there is no activity", async () => {
    fetchMock.mockResolvedValueOnce(listResponse([]));
    render(<ActivityPage />);
    expect(await screen.findByText(/no activity recorded yet/i)).toBeInTheDocument();
  });

  it("renders audit log rows once loaded", async () => {
    fetchMock.mockResolvedValueOnce(listResponse());
    render(<ActivityPage />);
    expect(await screen.findByText("product.created")).toBeInTheDocument();
    expect(screen.getByText("settings.updated")).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) } as Response);
    render(<ActivityPage />);
    expect(await screen.findByText(/could not load activity/i)).toBeInTheDocument();
  });

  it("filters rows client-side by search term without an extra network call", async () => {
    fetchMock.mockResolvedValueOnce(listResponse());
    const user = userEvent.setup();
    render(<ActivityPage />);
    await screen.findByText("product.created");

    await user.type(screen.getByLabelText(/search activity by action, actor or target id/i), "settings");
    await user.keyboard("{Enter}");

    expect(screen.queryByText("product.created")).not.toBeInTheDocument();
    expect(screen.getByText("settings.updated")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("filters rows by target type", async () => {
    fetchMock.mockResolvedValueOnce(listResponse());
    const user = userEvent.setup();
    render(<ActivityPage />);
    await screen.findByText("product.created");

    await user.selectOptions(screen.getByLabelText(/filter by target type/i), "settings");

    await waitFor(() => expect(screen.queryByText("product.created")).not.toBeInTheDocument());
    expect(screen.getByText("settings.updated")).toBeInTheDocument();
  });
});
