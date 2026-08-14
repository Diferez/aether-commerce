// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductForm, emptyProductForm, type ProductFormValues } from "./ProductForm";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

const getTokenMock = vi.fn(() => Promise.resolve("test-token"));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ getToken: getTokenMock })
}));

const fetchMock = vi.fn();

function filledValues(overrides: Partial<ProductFormValues> = {}): ProductFormValues {
  return {
    ...emptyProductForm,
    name: "Auriculares QA",
    category: "audio",
    shortDescription: "Un producto de prueba.",
    description: "Descripcion larga de prueba para el formulario.",
    images: { main: "/products/qa-1.webp", gallery: [] },
    priceCents: 5000,
    stock: 10,
    ...overrides
  };
}

describe("ProductForm", () => {
  beforeEach(() => {
    pushMock.mockClear();
    getTokenMock.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("blocks submission when required fields are missing (native HTML validation)", async () => {
    // name/category/shortDescription/description all carry a native
    // `required` attribute, so jsdom's constraint validation blocks the
    // submit event before ProductForm's own onSubmit handler ever runs -
    // the custom "...are required." message only fires past that point.
    // What's actually verifiable here is the outcome both layers agree on:
    // nothing gets submitted.
    const user = userEvent.setup();
    render(<ProductForm mode="create" initialValues={emptyProductForm} />);

    await user.click(screen.getByRole("button", { name: /create product/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks submission when the compare-at price is not higher than the price", async () => {
    const user = userEvent.setup();
    render(<ProductForm mode="create" initialValues={filledValues({ compareAtPriceCents: 4000 })} />);

    await user.click(screen.getByRole("button", { name: /create product/i }));

    expect(await screen.findByText(/compare-at price must be higher/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks submission when there is no main image yet", async () => {
    const user = userEvent.setup();
    render(<ProductForm mode="create" initialValues={filledValues({ images: { main: "", gallery: [] } })} />);

    await user.click(screen.getByRole("button", { name: /create product/i }));

    expect(await screen.findByText(/add at least a main image/i)).toBeInTheDocument();
  });

  it("submits a POST with the built payload and redirects to the edit page on success", async () => {
    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: { id: "prd_new_1" } })
    } as Response);

    const user = userEvent.setup();
    render(<ProductForm mode="create" initialValues={filledValues()} />);
    await user.click(screen.getByRole("button", { name: /create product/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/admin/products");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as { name: string; priceCents: number };
    expect(body.name).toBe("Auriculares QA");
    expect(body.priceCents).toBe(5000);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/products/edit/?id=prd_new_1"));
  });

  it("shows the API's error message when the save fails", async () => {
    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, error: { message: "Slug already in use." } })
    } as Response);

    const user = userEvent.setup();
    render(<ProductForm mode="create" initialValues={filledValues()} />);
    await user.click(screen.getByRole("button", { name: /create product/i }));

    expect(await screen.findByText("Slug already in use.")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("requires a second confirming click before deleting an existing product", async () => {
    const user = userEvent.setup();
    render(<ProductForm mode="edit" productId="prd_1" initialValues={filledValues()} />);

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/delete this product\?/i)).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: { deleted: true, softDeleted: false } })
    } as Response);

    await user.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/products/prd_1"),
        expect.objectContaining({ method: "DELETE" })
      )
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/products/"));
  });

  it("cancelling the delete confirmation does not call the API", async () => {
    const user = userEvent.setup();
    render(<ProductForm mode="edit" productId="prd_1" initialValues={filledValues()} />);

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByText(/delete this product\?/i)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
