// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomersListPage from "./page";

const getTokenMock = vi.fn(() => Promise.resolve(null));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: getTokenMock })
}));

const fetchMock = vi.fn();

function listResponse(data: unknown[] = [], total = data.length) {
  return {
    json: () =>
      Promise.resolve({
        success: true,
        data: { data, pagination: { page: 1, pageSize: 25, total, pageCount: Math.max(1, Math.ceil(total / 25)) } }
      })
  } as Response;
}

const sampleCustomer = {
  id: "usr_1",
  source: "registered" as const,
  name: "Jane Doe",
  email: "jane@example.com",
  roles: ["customer"],
  status: "active" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  orderCount: 3,
  totalSpent: 15000,
  lastOrderAt: "2026-01-05T00:00:00.000Z"
};

describe("CustomersListPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/customers/");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(listResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows an empty state when there are no customers", async () => {
    render(<CustomersListPage />);
    expect(await screen.findByText(/no customers yet/i)).toBeInTheDocument();
  });

  it("renders customer rows once loaded", async () => {
    fetchMock.mockResolvedValueOnce(listResponse([sampleCustomer], 1));
    render(<CustomersListPage />);
    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ success: false }) } as Response);
    render(<CustomersListPage />);
    expect(await screen.findByText(/could not load customers/i)).toBeInTheDocument();
  });

  it("re-fetches with the search term and resets the page in the URL", async () => {
    const user = userEvent.setup();
    render(<CustomersListPage />);
    await screen.findByText(/no customers yet/i);

    fetchMock.mockResolvedValueOnce(listResponse());
    await user.type(screen.getByLabelText(/search customers by name or email/i), "jane");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(window.location.search).toContain("search=jane"));
  });

  it("re-fetches when the status filter changes", async () => {
    const user = userEvent.setup();
    render(<CustomersListPage />);
    await screen.findByText(/no customers yet/i);

    fetchMock.mockResolvedValueOnce(listResponse());
    await user.selectOptions(screen.getByLabelText(/filter by status/i), "suspended");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("status=suspended"), expect.anything())
    );
  });

  it("paginates using the Next/Previous buttons", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: { data: [sampleCustomer], pagination: { page: 1, pageSize: 25, total: 60, pageCount: 3 } }
        })
    } as Response);
    render(<CustomersListPage />);
    await screen.findByText("Jane Doe");

    fetchMock.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: { data: [sampleCustomer], pagination: { page: 2, pageSize: 25, total: 60, pageCount: 3 } }
        })
    } as Response);
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("page=2"), expect.anything()));
    expect(await screen.findByText(/page 2 of 3/i)).toBeInTheDocument();
  });
});
