// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "../../test/render";
import { MessageList } from "./MessageList";
import type { ChatMessage } from "./types";

describe("MessageList - displayMessage override", () => {
  it("shows the raw tool message when the artifact sets no displayMessage override, same as before", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "tool", toolName: "get_webhook_activity", content: "3 recent webhook event(s), none failed.", artifact: { type: "activity_list", items: [] } }
    ];

    render(<MessageList messages={messages} resolvedOperationIds={new Set()} onConfirmAction={() => {}} />);

    expect(screen.getByText("3 recent webhook event(s), none failed.")).toBeInTheDocument();
  });

  it("suppresses the raw message and shows nothing but the card when displayMessage is an empty override", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "tool",
        toolName: "get_system_health",
        content: "System status: operational. No components are flagged.",
        artifact: { type: "dashboard_summary", summary: { status: "operational" }, displayMessage: "" }
      }
    ];

    render(<MessageList messages={messages} resolvedOperationIds={new Set()} onConfirmAction={() => {}} />);

    expect(screen.queryByText("System status: operational. No components are flagged.")).not.toBeInTheDocument();
  });

  it("shows the override text instead of the raw message when displayMessage is a non-empty string", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "tool",
        toolName: "get_system_health",
        content: "System status: critical. Full detail with internal ids the model needs.",
        artifact: { type: "dashboard_summary", summary: { status: "critical" }, displayMessage: "Short operator-facing summary." }
      }
    ];

    render(<MessageList messages={messages} resolvedOperationIds={new Set()} onConfirmAction={() => {}} />);

    expect(screen.getByText("Short operator-facing summary.")).toBeInTheDocument();
    expect(screen.queryByText(/Full detail with internal ids/)).not.toBeInTheDocument();
  });
});
