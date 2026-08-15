// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InventoryListPage from "./page";

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

const sampleProduct = {
  id: "prd_1",
  sku: "AUD-0001",
  name: "Auriculares QA",
  stock: 2,
  lowStockThreshold: 4,
  visibility: "visible" as const,
  thumbnail: null,
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("InventoryListPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/inventory/");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(listResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows an empty state when there are no products", async () => {
    render(<InventoryListPage />);
    expect(await screen.findByText(/no products yet/i)).toBeInTheDocument();
  });

  it("renders product rows with stock status once loaded", async () => {
    fetchMock.mockResolvedValueOnce(listResponse([sampleProduct], 1));
    render(<InventoryListPage />);
    expect(await screen.findByText("Auriculares QA")).toBeInTheDocument();
    const badges = screen.getAllByText("Low stock");
    expect(badges.some((el) => el.tagName === "SPAN" && el.className.includes("rounded-full"))).toBe(true);
  });

  it("shows an error state when the request fails", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ success: false }) } as Response);
    render(<InventoryListPage />);
    expect(await screen.findByText(/could not load inventory/i)).toBeInTheDocument();
  });

  it("submits a stock adjustment and reloads the list", async () => {
    fetchMock.mockResolvedValueOnce(listResponse([sampleProduct], 1));
    const user = userEvent.setup();
    render(<InventoryListPage />);
    await screen.findByText("Auriculares QA");

    await user.type(screen.getByLabelText(/stock adjustment amount for auriculares qa/i), "5");
    await user.type(screen.getByLabelText(/reason for stock adjustment for auriculares qa/i), "Restock");

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) } as Response);
    fetchMock.mockResolvedValueOnce(listResponse([{ ...sampleProduct, stock: 7 }], 1));

    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/products/prd_1/inventory-adjustment"),
        expect.objectContaining({ method: "POST" })
      )
    );
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("inventory-adjustment"));
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as { delta: number; reason: string };
    expect(body).toEqual({ delta: 5, reason: "Restock" });
  });

  it("shows a validation error and does not call the API for a zero delta", async () => {
    fetchMock.mockResolvedValueOnce(listResponse([sampleProduct], 1));
    const user = userEvent.setup();
    render(<InventoryListPage />);
    await screen.findByText("Auriculares QA");

    await user.click(screen.getByRole("button", { name: /apply/i }));

    expect(await screen.findByText(/enter a non-zero whole number/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("opens and closes the movement history panel", async () => {
    fetchMock.mockResolvedValueOnce(listResponse([sampleProduct], 1));
    const user = userEvent.setup();
    render(<InventoryListPage />);
    await screen.findByText("Auriculares QA");

    fetchMock.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: [{ id: "mv_1", product_id: "prd_1", sku: "AUD-0001", type: "restock", quantity: 5, reason: "Restock", actor_id: "admin_1", created_at: "2026-01-01T00:00:00.000Z" }]
        })
    } as Response);

    await user.click(screen.getByRole("button", { name: /view/i }));

    expect(await screen.findByText("restock")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/inventory/movements?productId=prd_1"),
        expect.anything()
      )
    );

    await user.click(screen.getByRole("button", { name: /hide/i }));
    expect(screen.queryByText("restock")).not.toBeInTheDocument();
  });
});
