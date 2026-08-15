// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderDetailPage from "./page";

const getTokenMock = vi.fn(() => Promise.resolve(null));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: getTokenMock })
}));

const fetchMock = vi.fn();

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_1",
    number: "AC-1001",
    email: "buyer@example.com",
    state: "confirmed",
    channel: "stripe",
    paymentStatus: "paid",
    fulfillmentStatus: "unfulfilled",
    items: [
      { productId: "prd_1", quantity: 1, name: "Auriculares QA", slug: "auriculares-qa", imageUrl: "", unitPrice: 5000, finalUnitPrice: 5000, lineTotal: 5000, currency: "USD" }
    ],
    totals: { subtotal: 5000, discount: 0, shipping: 0, tax: 0, total: 5000, currency: "USD" },
    shippingAddress: { fullName: "Jane Doe", line1: "123 Main St", city: "Metropolis", region: "NY", postalCode: "10001", country: "US" },
    payment: { providerPaymentIntentId: "pi_123" },
    internalNotes: null,
    tracking: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    history: [],
    ...overrides
  };
}

function detailResponse(data: unknown) {
  return { status: 200, json: () => Promise.resolve({ success: true, data }) } as Response;
}

describe("OrderDetailPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/orders/detail/?id=ord_1");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows a not-found state when there is no id", async () => {
    window.history.replaceState(null, "", "/orders/detail/");
    render(<OrderDetailPage />);
    expect(await screen.findByText(/order not found/i)).toBeInTheDocument();
  });

  it("shows a not-found state on a 404 response", async () => {
    fetchMock.mockResolvedValueOnce({ status: 404, json: () => Promise.resolve({}) } as Response);
    render(<OrderDetailPage />);
    expect(await screen.findByText(/order not found/i)).toBeInTheDocument();
  });

  it("renders order details once loaded", async () => {
    fetchMock.mockResolvedValueOnce(detailResponse(baseOrder()));
    render(<OrderDetailPage />);
    expect(await screen.findByText("AC-1001")).toBeInTheDocument();
    expect(screen.getByText("Auriculares QA")).toBeInTheDocument();
    expect(screen.getByText(/jane doe/i)).toBeInTheDocument();
  });

  it("saves tracking info", async () => {
    fetchMock.mockResolvedValueOnce(detailResponse(baseOrder()));
    const user = userEvent.setup();
    render(<OrderDetailPage />);
    await screen.findByText("AC-1001");

    await user.type(screen.getByPlaceholderText(/^carrier$/i), "DHL");
    await user.type(screen.getByPlaceholderText(/tracking number/i), "TRK-1");

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) } as Response);
    fetchMock.mockResolvedValueOnce(detailResponse(baseOrder({ tracking: { carrier: "DHL", number: "TRK-1", url: null } })));

    await user.click(screen.getByRole("button", { name: /save tracking/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/orders/ord_1/tracking"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/tracking"));
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as { carrier: string; number: string; url: string | null };
    expect(body).toEqual({ carrier: "DHL", number: "TRK-1", url: null });
  });

  it("saves internal notes", async () => {
    fetchMock.mockResolvedValueOnce(detailResponse(baseOrder()));
    const user = userEvent.setup();
    render(<OrderDetailPage />);
    await screen.findByText("AC-1001");

    const textarea = screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;
    await user.type(textarea, "Fragile item");

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) } as Response);
    fetchMock.mockResolvedValueOnce(detailResponse(baseOrder({ internalNotes: "Fragile item" })));

    await user.click(screen.getByRole("button", { name: /save notes/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/orders/ord_1/notes"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
  });

  it("advances the fulfillment status via a transition button", async () => {
    fetchMock.mockResolvedValueOnce(detailResponse(baseOrder({ fulfillmentStatus: "unfulfilled" })));
    const user = userEvent.setup();
    render(<OrderDetailPage />);
    await screen.findByText("AC-1001");

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) } as Response);
    fetchMock.mockResolvedValueOnce(detailResponse(baseOrder({ fulfillmentStatus: "processing" })));

    await user.click(screen.getByRole("button", { name: /mark as processing/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/orders/ord_1/fulfillment"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
  });

  it("requires a second confirming click before issuing a Stripe refund", async () => {
    fetchMock.mockResolvedValueOnce(detailResponse(baseOrder({ paymentStatus: "paid" })));
    const user = userEvent.setup();
    render(<OrderDetailPage />);
    await screen.findByText("AC-1001");

    await user.click(screen.getByRole("button", { name: /refund via stripe/i }));
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) } as Response);
    fetchMock.mockResolvedValueOnce(detailResponse(baseOrder({ paymentStatus: "refunded" })));

    await user.click(screen.getByRole("button", { name: /confirm refund/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/orders/ord_1/refund"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("cancelling the refund confirmation does not call the API", async () => {
    fetchMock.mockResolvedValueOnce(detailResponse(baseOrder({ paymentStatus: "paid" })));
    const user = userEvent.setup();
    render(<OrderDetailPage />);
    await screen.findByText("AC-1001");

    await user.click(screen.getByRole("button", { name: /refund via stripe/i }));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
