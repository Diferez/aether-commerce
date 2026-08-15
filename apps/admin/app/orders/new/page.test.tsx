// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewManualOrderPage from "./page";

const getTokenMock = vi.fn(() => Promise.resolve(null));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: getTokenMock })
}));

const fetchMock = vi.fn();

const sampleProduct = { id: "prd_1", name: "Auriculares QA", sku: "AUD-0001", final_price_cents: 5000 };

function searchResponse(data: unknown[] = []) {
  return { json: () => Promise.resolve({ success: true, data: { data } }) } as Response;
}

describe("NewManualOrderPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("keeps the submit button disabled until an email and an item are present", () => {
    render(<NewManualOrderPage />);
    expect(screen.getByRole("button", { name: /create order/i })).toBeDisabled();
  });

  it("searches the catalog and adds a result as a line item", async () => {
    const user = userEvent.setup();
    render(<NewManualOrderPage />);

    fetchMock.mockResolvedValueOnce(searchResponse([sampleProduct]));
    await user.type(screen.getByPlaceholderText(/search by name or sku/i), "auriculares");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/products?search=auriculares"),
        expect.anything()
      )
    );

    await user.click(await screen.findByRole("button", { name: /add/i }));

    expect(screen.getAllByText("Auriculares QA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$50.00").length).toBeGreaterThan(0);
  });

  it("increments quantity when the same product is added twice", async () => {
    const user = userEvent.setup();
    render(<NewManualOrderPage />);

    fetchMock.mockResolvedValue(searchResponse([sampleProduct]));
    await user.type(screen.getByPlaceholderText(/search by name or sku/i), "auriculares");
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: /add/i }));
    await user.click(screen.getByRole("button", { name: /add/i }));

    const quantityInput = screen.getByDisplayValue("2");
    expect(quantityInput).toBeInTheDocument();
  });

  it("removes a line item", async () => {
    const user = userEvent.setup();
    render(<NewManualOrderPage />);

    fetchMock.mockResolvedValueOnce(searchResponse([sampleProduct]));
    await user.type(screen.getByPlaceholderText(/search by name or sku/i), "auriculares");
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: /add/i }));

    await user.click(screen.getByRole("button", { name: /remove auriculares qa/i }));

    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });

  it("submits the order with email and line items", async () => {
    const user = userEvent.setup();
    render(<NewManualOrderPage />);

    fetchMock.mockResolvedValueOnce(searchResponse([sampleProduct]));
    await user.type(screen.getByPlaceholderText(/search by name or sku/i), "auriculares");
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: /add/i }));

    await user.type(screen.getByPlaceholderText(/customer@example.com/i), "buyer@example.com");

    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: { id: "ord_new_1" } })
    } as Response);

    const submitButton = screen.getByRole("button", { name: /create order/i });
    expect(submitButton).not.toBeDisabled();
    await user.click(submitButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/orders/manual"),
        expect.objectContaining({ method: "POST" })
      )
    );
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/orders/manual"));
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as {
      email: string;
      items: Array<{ productId: string; quantity: number }>;
      notes?: string;
    };
    expect(body).toEqual({ email: "buyer@example.com", items: [{ productId: "prd_1", quantity: 1 }], notes: undefined });
  });

  it("shows the API's error message when order creation fails", async () => {
    const user = userEvent.setup();
    render(<NewManualOrderPage />);

    fetchMock.mockResolvedValueOnce(searchResponse([sampleProduct]));
    await user.type(screen.getByPlaceholderText(/search by name or sku/i), "auriculares");
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: /add/i }));
    await user.type(screen.getByPlaceholderText(/customer@example.com/i), "buyer@example.com");

    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, error: { message: "Product is out of stock." } })
    } as Response);

    await user.click(screen.getByRole("button", { name: /create order/i }));

    expect(await screen.findByText("Product is out of stock.")).toBeInTheDocument();
  });
});
