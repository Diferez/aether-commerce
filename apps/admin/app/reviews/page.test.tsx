// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../../test/render";
import userEvent from "@testing-library/user-event";
import ReviewsPage from "./page";

const getTokenMock = vi.fn(() => Promise.resolve(null));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: getTokenMock })
}));

const fetchMock = vi.fn();

const pendingReview = {
  id: "rev_1",
  status: "pending",
  rating: 4,
  title: "Great fit",
  body: "Works exactly as described.",
  created_at: "2026-08-19T10:00:00Z",
  product_id: "prd_1",
  product_name: "Funda Slim Grip",
  user_id: "user_abc",
  user_email: "buyer@example.com",
  user_name: "Maria Gomez"
};

function listResponse(data: unknown[] = [pendingReview]) {
  return { json: () => Promise.resolve({ success: true, data }) } as Response;
}

function lastFetchUrl(): string {
  const call = fetchMock.mock.calls.at(-1) as [string] | undefined;
  return call?.[0] ?? "";
}

describe("ReviewsPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("loads the pending queue by default and shows the product/reviewer/status, never a bare id", async () => {
    fetchMock.mockResolvedValueOnce(listResponse());
    render(<ReviewsPage />);

    expect(await screen.findByText("Funda Slim Grip")).toBeInTheDocument();
    expect(screen.getByText("Maria Gomez")).toBeInTheDocument();
    expect(screen.getByText("Great fit")).toBeInTheDocument();
    expect(screen.queryByText("prd_1")).not.toBeInTheDocument();
    expect(screen.queryByText("user_abc")).not.toBeInTheDocument();
    expect(lastFetchUrl()).toContain("/admin/reviews?status=pending");
  });

  it("shows an error state when the load fails", async () => {
    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: false }) } as Response);
    render(<ReviewsPage />);
    expect(await screen.findByText(/could not load reviews/i)).toBeInTheDocument();
  });

  it("shows an empty state when nothing matches the active filter", async () => {
    fetchMock.mockResolvedValueOnce(listResponse([]));
    render(<ReviewsPage />);
    expect(await screen.findByText(/no reviews match this filter/i)).toBeInTheDocument();
  });

  it("approves a review and removes it from the pending list", async () => {
    fetchMock.mockResolvedValueOnce(listResponse());
    const user = userEvent.setup();
    render(<ReviewsPage />);
    await screen.findByText("Funda Slim Grip");

    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) } as Response);
    await user.click(screen.getByRole("button", { name: /^approve$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/admin/reviews/rev_1/moderation"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/moderation"));
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as { status: string };
    expect(body.status).toBe("approved");
    await waitFor(() => expect(screen.queryByText("Funda Slim Grip")).not.toBeInTheDocument());
  });

  it("refetches with the new status when switching filter tabs", async () => {
    fetchMock.mockResolvedValueOnce(listResponse());
    const user = userEvent.setup();
    render(<ReviewsPage />);
    await screen.findByText("Funda Slim Grip");

    fetchMock.mockResolvedValueOnce(listResponse([{ ...pendingReview, status: "approved" }]));
    await user.click(screen.getByRole("button", { name: /^approved$/i }));

    await waitFor(() => expect(lastFetchUrl()).toContain("/admin/reviews?status=approved"));
  });
});
