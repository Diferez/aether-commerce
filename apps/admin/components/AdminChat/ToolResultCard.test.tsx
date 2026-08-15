// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToolResultCard } from "./ToolResultCard";
import type { ChatArtifact } from "./types";

describe("ToolResultCard - dashboard_summary", () => {
  it("renders get_system_health's critical status as a badge with human-readable stat labels, not raw camelCase keys", () => {
    const artifact: ChatArtifact = {
      type: "dashboard_summary",
      summary: {
        status: "critical",
        errors24h: 0,
        webhooksFailed24h: 0,
        paymentsFailed24h: 0,
        adminFailedAttempts1h: 5,
        negativeInventoryCount: 0,
        blockedOrdersCount: 2,
        avgLatencyMs: 95,
        lastCriticalTask: "ok (1 minute(s) ago)"
      },
      issues: [
        { name: "orders", level: "critical", reason: "A paid order has been unfulfilled for 31.6 day(s)" },
        { name: "security", level: "degraded", reason: "5 failed admin attempt(s) recently" }
      ],
      relatedOrders: [
        {
          id: "ord_cs_test_a1",
          number: "AETH-A1IMHHNRFA",
          email: "diegomxxx@gmail.com",
          state: "paid",
          paymentStatus: "paid",
          fulfillmentStatus: "unfulfilled",
          totalCents: 26978,
          currency: "USD",
          createdAt: "2026-07-15T10:08:19Z",
          href: "/orders/detail/?id=ord_cs_test_a1"
        }
      ]
    };

    render(<ToolResultCard artifact={artifact} />);

    // Status renders as a badge ("Critical"), not a raw "status: critical" grid cell.
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.queryByText("status")).not.toBeInTheDocument();

    // Stat grid uses human-readable labels and units, not raw field names.
    expect(screen.getByText("Failed admin attempts (1h)")).toBeInTheDocument();
    expect(screen.queryByText("adminFailedAttempts1h")).not.toBeInTheDocument();
    expect(screen.getByText("95ms")).toBeInTheDocument();

    // Component-level issues render with their concrete reason.
    expect(screen.getByText("A paid order has been unfulfilled for 31.6 day(s)")).toBeInTheDocument();
    expect(screen.getByText("5 failed admin attempt(s) recently")).toBeInTheDocument();

    // The specific blocked order is named, clickable, and never shows the internal id.
    expect(screen.getByText("AETH-A1IMHHNRFA")).toBeInTheDocument();
    expect(screen.queryByText(/ord_cs_test_a1/)).not.toBeInTheDocument();
  });

  it("still renders a plain stat grid for tools that never set status/issues/relatedOrders", () => {
    const artifact: ChatArtifact = {
      type: "dashboard_summary",
      summary: { orders: 128, lowStock: 3 }
    };

    render(<ToolResultCard artifact={artifact} />);

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("Low stock")).toBeInTheDocument();
  });
});
