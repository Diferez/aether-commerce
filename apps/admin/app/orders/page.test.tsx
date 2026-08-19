// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../../test/render";
import userEvent from "@testing-library/user-event";
import OrdersListPage from "./page";

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

const sampleOrder = {
  id: "ord_1",
  number: "AC-1001",
  email: "buyer@example.com",
  state: "confirmed",
  channel: "stripe" as const,
  payment_status: "paid" as const,
  fulfillment_status: "unfulfilled" as const,
  total: 12000,
  currency: "USD",
  created_at: "2026-01-01T00:00:00.000Z"
};

describe("OrdersListPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/orders/");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(listResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows an empty state when there are no orders", async () => {
    render(<OrdersListPage />);
    expect(await screen.findByText(/no orders yet/i)).toBeInTheDocument();
  });

  it("renders order rows once loaded", async () => {
    fetchMock.mockResolvedValueOnce(listResponse([sampleOrder], 1));
    render(<OrdersListPage />);
    expect(await screen.findByText("AC-1001")).toBeInTheDocument();
    expect(screen.getByText("buyer@example.com")).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ success: false }) } as Response);
    render(<OrdersListPage />);
    expect(await screen.findByText(/could not load orders/i)).toBeInTheDocument();
  });

  it("re-fetches with the search term and resets the page in the URL", async () => {
    const user = userEvent.setup();
    render(<OrdersListPage />);
    await screen.findByText(/no orders yet/i);

    fetchMock.mockResolvedValueOnce(listResponse());
    await user.type(screen.getByLabelText(/search orders by order number or email/i), "AC-1001");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(window.location.search).toContain("search=AC-1001"));
  });

  it("re-fetches when the fulfillment status filter changes", async () => {
    const user = userEvent.setup();
    render(<OrdersListPage />);
    await screen.findByText(/no orders yet/i);

    fetchMock.mockResolvedValueOnce(listResponse());
    await user.selectOptions(screen.getByLabelText(/filter by fulfillment status/i), "shipped");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("fulfillmentStatus=shipped"), expect.anything())
    );
  });

  it("paginates using the Next/Previous buttons", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: { data: [sampleOrder], pagination: { page: 1, pageSize: 25, total: 60, pageCount: 3 } }
        })
    } as Response);
    render(<OrdersListPage />);
    await screen.findByText("AC-1001");

    fetchMock.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: { data: [sampleOrder], pagination: { page: 2, pageSize: 25, total: 60, pageCount: 3 } }
        })
    } as Response);
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("page=2"), expect.anything()));
    expect(await screen.findByText(/page 2 of 3/i)).toBeInTheDocument();
  });

  it("downloads a CSV export when the button is clicked", async () => {
    const user = userEvent.setup();
    render(<OrdersListPage />);
    await screen.findByText(/no orders yet/i);

    const blob = new Blob(["a,b"], { type: "text/csv" });
    fetchMock.mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(blob) } as unknown as Response);
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });

    await user.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("/api/v1/admin/export/orders"), expect.anything())
    );
  });
});
