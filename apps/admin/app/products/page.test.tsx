// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductsListPage from "./page";

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
  slug: "auriculares-qa",
  name: "Auriculares QA",
  brand: "Aether",
  category: "audio",
  priceCents: 5000,
  compareAtPriceCents: null,
  finalPriceCents: 5000,
  stock: 2,
  lowStockThreshold: 4,
  visibility: "visible" as const,
  thumbnail: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("ProductsListPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/products/");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(listResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows an empty state when there are no products and no filters are active", async () => {
    render(<ProductsListPage />);
    expect(await screen.findByText(/no products yet/i)).toBeInTheDocument();
  });

  it("shows a filtered empty state message once a filter is applied", async () => {
    const user = userEvent.setup();
    render(<ProductsListPage />);
    await screen.findByText(/no products yet/i);

    fetchMock.mockResolvedValueOnce(listResponse());
    await user.type(screen.getByPlaceholderText(/search by name or sku/i), "zzz-no-match");
    await user.keyboard("{Enter}");

    expect(await screen.findByText(/no products match these filters/i)).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ success: false }) } as Response);
    render(<ProductsListPage />);
    expect(await screen.findByText(/could not load products/i)).toBeInTheDocument();
  });

  it("renders low-stock products with a distinct visual treatment", async () => {
    fetchMock.mockResolvedValueOnce(listResponse([sampleProduct], 1));
    render(<ProductsListPage />);

    const stockCell = await screen.findByText("2");
    expect(stockCell.className).toContain("amber");
  });

  it("puts search, filters and page into the URL so the view survives a reload", async () => {
    const user = userEvent.setup();
    render(<ProductsListPage />);
    await screen.findByText(/no products yet/i);

    await user.type(screen.getByPlaceholderText(/search by name or sku/i), "aether");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(window.location.search).toContain("search=aether"));
  });

  it("sends a bulk archive request for every selected product", async () => {
    fetchMock.mockResolvedValueOnce(listResponse([sampleProduct], 1));
    const user = userEvent.setup();
    render(<ProductsListPage />);

    await screen.findByText("Auriculares QA");
    await user.click(screen.getByLabelText(/select auriculares qa/i));

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) } as Response);
    fetchMock.mockResolvedValueOnce(listResponse([sampleProduct], 1));

    await user.click(screen.getByRole("button", { name: /archive/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/products/bulk"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});
