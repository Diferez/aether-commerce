// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomerDetailPage from "./page";

const getTokenMock = vi.fn(() => Promise.resolve(null));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: getTokenMock })
}));

const fetchMock = vi.fn();

function baseCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: "usr_1",
    source: "registered",
    name: "Jane Doe",
    email: "jane@example.com",
    roles: ["customer"],
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    addresses: [],
    orders: [],
    ...overrides
  };
}

function detailResponse(data: unknown) {
  return { status: 200, json: () => Promise.resolve({ success: true, data }) } as Response;
}

describe("CustomerDetailPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/customers/detail/?id=usr_1");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows a not-found state on a 404 response", async () => {
    fetchMock.mockResolvedValueOnce({ status: 404, json: () => Promise.resolve({}) } as Response);
    render(<CustomerDetailPage />);
    expect(await screen.findByText(/customer not found/i)).toBeInTheDocument();
  });

  it("renders customer details once loaded", async () => {
    fetchMock.mockResolvedValueOnce(detailResponse(baseCustomer()));
    render(<CustomerDetailPage />);
    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText(/jane@example.com/i)).toBeInTheDocument();
  });

  it("shows a guest banner instead of suspend/role controls for guest customers", async () => {
    fetchMock.mockResolvedValueOnce(detailResponse(baseCustomer({ source: "guest", name: null })));
    render(<CustomerDetailPage />);
    expect(await screen.findByText(/checked out as a guest/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /suspend account/i })).not.toBeInTheDocument();
  });

  it("suspends a registered customer after confirming", async () => {
    fetchMock.mockResolvedValueOnce(detailResponse(baseCustomer({ status: "active" })));
    const user = userEvent.setup();
    render(<CustomerDetailPage />);
    await screen.findByText("Jane Doe");

    await user.click(screen.getByRole("button", { name: /suspend account/i }));
    expect(screen.getByText(/suspend this account\?/i)).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) } as Response);
    fetchMock.mockResolvedValueOnce(detailResponse(baseCustomer({ status: "suspended" })));

    await user.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/users/usr_1/status"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/status"));
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as { status: string };
    expect(body).toEqual({ status: "suspended" });
  });

  it("cancelling the suspend confirmation does not call the API", async () => {
    fetchMock.mockResolvedValueOnce(detailResponse(baseCustomer({ status: "active" })));
    const user = userEvent.setup();
    render(<CustomerDetailPage />);
    await screen.findByText("Jane Doe");

    await user.click(screen.getByRole("button", { name: /suspend account/i }));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByText(/suspend this account\?/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("changes the customer's role after confirming", async () => {
    fetchMock.mockResolvedValueOnce(detailResponse(baseCustomer({ roles: ["customer"] })));
    const user = userEvent.setup();
    render(<CustomerDetailPage />);
    await screen.findByText("Jane Doe");

    await user.selectOptions(screen.getByRole("combobox"), "support");
    await user.click(screen.getByRole("button", { name: /save role/i }));
    expect(screen.getByText(/change this person's role/i)).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) } as Response);
    fetchMock.mockResolvedValueOnce(detailResponse(baseCustomer({ roles: ["support"] })));

    await user.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/users/usr_1/role"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/role"));
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as { role: string };
    expect(body).toEqual({ role: "support" });
  });

  it("disables the save-role button until a different role is selected", async () => {
    fetchMock.mockResolvedValueOnce(detailResponse(baseCustomer({ roles: ["customer"] })));
    render(<CustomerDetailPage />);
    await screen.findByText("Jane Doe");

    expect(screen.getByRole("button", { name: /save role/i })).toBeDisabled();
  });
});
