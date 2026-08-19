// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { PendingActionCard } from "./PendingActionCard";
import type { ActionDiff } from "./types";

const diff: ActionDiff = {
  summary: "Mark order AETH-1 as shipped",
  targetLabel: "AETH-1",
  fields: [{ field: "fulfillmentStatus", before: "processing", after: "shipped" }]
};

describe("PendingActionCard", () => {
  it("calls onConfirm with the operationId when the operator clicks Confirm", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<PendingActionCard operationId="pact_1" diff={diff} expiresAt={new Date(Date.now() + 300_000).toISOString()} resolved={false} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onConfirm).toHaveBeenCalledWith("pact_1");
  });

  it("dismisses locally without calling onConfirm when Cancel is clicked", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<PendingActionCard operationId="pact_1" diff={diff} expiresAt={new Date(Date.now() + 300_000).toISOString()} resolved={false} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(await screen.findByText(/nothing was changed/i)).toBeInTheDocument();
  });

  it("shows an expired notice and no action buttons once expiresAt has passed", () => {
    render(<PendingActionCard operationId="pact_1" diff={diff} expiresAt={new Date(Date.now() - 1000).toISOString()} resolved={false} onConfirm={vi.fn()} />);

    expect(screen.getByText(/this preview expired/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
  });

  it("renders nothing once the action has already been resolved (a receipt is shown instead)", () => {
    const { container } = render(<PendingActionCard operationId="pact_1" diff={diff} expiresAt={new Date(Date.now() + 300_000).toISOString()} resolved={true} onConfirm={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
