// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../test/render";
import userEvent from "@testing-library/user-event";
import { AdminDashboard } from "./AdminDashboard";

const getTokenMock = vi.fn(() => Promise.resolve(null));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: getTokenMock })
}));

const fetchMock = vi.fn();

const sampleProduct = { id: "prd_1", name: "Auriculares QA", sku: "AUD-0001", stock: 10, lowStockThreshold: 4, visibility: "visible" as const };
const lowStockProduct = { id: "prd_2", name: "Teclado QA", sku: "KEY-0001", stock: 1, lowStockThreshold: 4, visibility: "visible" as const };
const sampleOrder = {
  id: "ord_1",
  number: "AC-1001",
  email: "buyer@example.com",
  channel: "stripe" as const,
  payment_status: "paid" as const,
  fulfillment_status: "unfulfilled" as const,
  total: 12000,
  currency: "USD"
};
const sampleCustomer = { id: "usr_1", source: "registered" as const, name: "Jane Doe", email: "jane@example.com", status: "active" as const, orderCount: 2 };
const sampleMessage = {
  id: "msg_1",
  name: "John Buyer",
  email: "john@example.com",
  subject: "Question about shipping",
  message: "When will my order arrive?",
  locale: "en",
  email_status: null,
  created_at: "2026-01-01T00:00:00.000Z"
};

function ok(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve({ success: true, data }) } as Response;
}

function defaultRouter(overrides: Partial<Record<string, unknown>> = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("pageSize=3&sort=updated_at")) {
      return Promise.resolve(ok(overrides.products ?? { data: [sampleProduct], pagination: { total: 1 } }));
    }
    if (url.includes("stock=low")) {
      return Promise.resolve(ok(overrides.lowStock ?? { data: [lowStockProduct] }));
    }
    if (url.includes("/admin/summary") || url.includes("/admin/demo/summary")) {
      return Promise.resolve(
        ok(overrides.summary ?? { mode: "private", revenue: 100000, orders: 5, conversionRate: 3.2, lowStock: 1 })
      );
    }
    if (url.includes("/admin/orders")) {
      return Promise.resolve(ok(overrides.orders ?? { data: [sampleOrder], pagination: { total: 1 } }));
    }
    if (url.includes("/admin/users")) {
      return Promise.resolve(ok(overrides.customers ?? { data: [sampleCustomer], pagination: { total: 1 } }));
    }
    if (url.includes("/admin/contact-messages")) {
      return Promise.resolve(ok(overrides.messages ?? [sampleMessage]));
    }
    return Promise.resolve(ok(null));
  });
}

describe("AdminDashboard", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });
  });

  it("renders data from every panel once each fetch resolves", async () => {
    defaultRouter();
    render(<AdminDashboard />);

    expect(await screen.findByText("Auriculares QA")).toBeInTheDocument();
    expect(await screen.findByText("Teclado QA")).toBeInTheDocument();
    expect(await screen.findByText("AC-1001")).toBeInTheDocument();
    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(await screen.findByText("John Buyer")).toBeInTheDocument();
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
  });

  it("shows a permission-denied message when contact messages return 403", async () => {
    defaultRouter();
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/admin/contact-messages")) {
        return Promise.resolve({ status: 403, json: () => Promise.resolve({}) } as Response);
      }
      if (url.includes("pageSize=3&sort=updated_at")) return Promise.resolve(ok({ data: [], pagination: { total: 0 } }));
      if (url.includes("stock=low")) return Promise.resolve(ok({ data: [] }));
      if (url.includes("/admin/summary")) return Promise.resolve(ok({ mode: "private", revenue: 0, orders: 0, conversionRate: 0, lowStock: 0 }));
      if (url.includes("/admin/orders")) return Promise.resolve(ok({ data: [], pagination: { total: 0 } }));
      if (url.includes("/admin/users")) return Promise.resolve(ok({ data: [], pagination: { total: 0 } }));
      return Promise.resolve(ok(null));
    });
    render(<AdminDashboard />);

    expect(await screen.findByText(/does not have the contacts.read permission/i)).toBeInTheDocument();
  });

  it("expands a contact message to show its full body", async () => {
    defaultRouter();
    const user = userEvent.setup();
    render(<AdminDashboard />);

    const row = await screen.findByRole("button", { name: /john buyer/i });
    expect(row).toHaveAttribute("aria-expanded", "false");

    await user.click(row);

    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/when will my order arrive/i)).toBeInTheDocument();
  });

  it("downloads a CSV export when the button is clicked", async () => {
    defaultRouter();
    const user = userEvent.setup();
    render(<AdminDashboard />);
    await screen.findByText("Auriculares QA");

    const blob = new Blob(["a,b"], { type: "text/csv" });
    fetchMock.mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(blob) } as unknown as Response);

    await user.click(screen.getByRole("button", { name: /export orders csv/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/admin/export/orders"), expect.anything())
    );
  });

  it("disables the export action in demo mode", async () => {
    defaultRouter();
    render(<AdminDashboard demo />);
    await screen.findByText("Auriculares QA");

    expect(screen.getByRole("button", { name: /export orders csv/i })).toBeDisabled();
  });

  it("links the Activity and Settings cards to their real routes", async () => {
    defaultRouter();
    render(<AdminDashboard />);
    await screen.findByText("Auriculares QA");

    expect(screen.getByRole("link", { name: /activity/i })).toHaveAttribute("href", "/activity/");
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/settings/");
  });

  it("requests the demo summary endpoint when demo is true", async () => {
    defaultRouter();
    render(<AdminDashboard demo />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/admin/demo/summary"))
    );
  });
});
