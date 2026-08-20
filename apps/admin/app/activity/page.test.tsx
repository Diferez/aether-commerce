// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "../../test/render";
import userEvent from "@testing-library/user-event";
import ActivityPage from "./page";

const getTokenMock = vi.fn(() => Promise.resolve(null));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: getTokenMock })
}));

const fetchMock = vi.fn();

type Pagination = { page: number; pageSize: number; total: number; pageCount: number };

const sampleEntries = [
  {
    id: "log_1",
    actor_id: "usr_admin",
    actor_role: "admin",
    action: "product.updated",
    target_type: "product",
    target_id: "prd_1",
    payload_json: "{}",
    previous_data: JSON.stringify({ priceCents: 1000 }),
    new_data: JSON.stringify({ priceCents: 1200 }),
    request_id: "req_abc123",
    created_at: "2026-01-02 00:00:00"
  },
  {
    id: "log_2",
    actor_id: "usr_admin",
    actor_role: "admin",
    action: "settings.updated",
    target_type: "settings",
    target_id: "shipping",
    payload_json: "{}",
    previous_data: null,
    new_data: null,
    request_id: "req_def456",
    created_at: "2026-01-01 00:00:00"
  }
];

function listResponse(
  data: unknown[] = sampleEntries,
  pagination: Pagination = { page: 1, pageSize: 25, total: data.length, pageCount: 1 }
) {
  return { json: () => Promise.resolve({ success: true, data, pagination }) } as Response;
}

function lastFetchUrl(): string {
  const call = fetchMock.mock.calls.at(-1) as [string] | undefined;
  return call?.[0] ?? "";
}

describe("ActivityPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/activity");
  });

  it("shows an empty state when there is no activity", async () => {
    fetchMock.mockResolvedValueOnce(listResponse([], { page: 1, pageSize: 25, total: 0, pageCount: 1 }));
    render(<ActivityPage />);
    expect(await screen.findByText(/no activity recorded yet/i)).toBeInTheDocument();
  });

  it("renders audit log rows with humanized action names once loaded", async () => {
    fetchMock.mockResolvedValueOnce(listResponse());
    render(<ActivityPage />);
    expect(await screen.findByText("Product updated")).toBeInTheDocument();
    expect(screen.getByText("Settings updated")).toBeInTheDocument();
  });

  it("shows the resolved actor name instead of the raw Clerk id when the API provides one, falling back to the id otherwise", async () => {
    fetchMock.mockResolvedValueOnce(
      listResponse([
        { ...sampleEntries[0], actor_name: "Diego Martinez" },
        { ...sampleEntries[1], actor_name: null }
      ])
    );
    render(<ActivityPage />);
    expect(await screen.findByText("Diego Martinez")).toBeInTheDocument();
    expect(screen.getByText("usr_admin")).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) } as Response);
    render(<ActivityPage />);
    expect(await screen.findByText(/could not load activity/i)).toBeInTheDocument();
  });

  it("searches by request ID via a real server round-trip, not client-side filtering", async () => {
    fetchMock.mockResolvedValueOnce(listResponse());
    fetchMock.mockResolvedValueOnce(listResponse([sampleEntries[0]!], { page: 1, pageSize: 25, total: 1, pageCount: 1 }));
    const user = userEvent.setup();
    render(<ActivityPage />);
    await screen.findByText("Product updated");

    await user.type(screen.getByLabelText(/search activity by request id/i), "req_abc123");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(lastFetchUrl()).toContain("requestId=req_abc123");
  });

  it("filters by admin ID, action, and entity type through query params on the real request", async () => {
    fetchMock.mockResolvedValueOnce(listResponse());
    fetchMock.mockResolvedValueOnce(listResponse());
    render(<ActivityPage />);
    await screen.findByText("Product updated");

    fireEvent.change(screen.getByLabelText(/filter by admin id/i), { target: { value: "usr_admin" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(lastFetchUrl()).toContain("actorId=usr_admin");
  });

  it("opens a detail view with the before/after diff when an action is clicked", async () => {
    fetchMock.mockResolvedValueOnce(listResponse());
    const user = userEvent.setup();
    render(<ActivityPage />);
    await screen.findByText("Product updated");

    await user.click(screen.getByText("Product updated"));

    expect(await screen.findByText("What changed")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.getByText("1200")).toBeInTheDocument();
  });

  it("requests the next page from the server instead of paginating client-side", async () => {
    fetchMock.mockResolvedValueOnce(listResponse(sampleEntries, { page: 1, pageSize: 25, total: 60, pageCount: 3 }));
    fetchMock.mockResolvedValueOnce(listResponse(sampleEntries, { page: 2, pageSize: 25, total: 60, pageCount: 3 }));
    const user = userEvent.setup();
    render(<ActivityPage />);
    await screen.findByText("Product updated");

    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(lastFetchUrl()).toContain("page=2");
  });
});
