// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "../../../test/render";
import IntegrationsSettingsPage from "./page";

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn(() => Promise.resolve(null)) })
}));

const fetchMock = vi.fn();

describe("IntegrationsSettingsPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/admin/checkout-settings")) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                mode: "stripe",
                stripe: { configured: false, secretKeyPreview: null, webhookConfigured: false },
                wompi: { configured: false, secretKeyPreview: null, webhookConfigured: false }
              }
            })
        } as Response);
      }
      if (url.includes("/admin/integration-settings")) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                resend: { configured: false, apiKeyPreview: null },
                gemini: { configured: false, apiKeyPreview: null },
                cloudinary: { configured: false, cloudName: null, apiKeyPreview: null, secretConfigured: false }
              }
            })
        } as Response);
      }
      return Promise.resolve({ json: () => Promise.resolve({ success: false }) } as Response);
    });
  });

  it("renders both the checkout-provider and integration-secrets sections on their own dedicated page", async () => {
    render(<IntegrationsSettingsPage />);

    expect(await screen.findByText("Resend (email)")).toBeInTheDocument();
    expect(await screen.findByText("Gemini (AI assistants)")).toBeInTheDocument();
    expect(await screen.findByText("Cloudinary (product images)")).toBeInTheDocument();
    expect(document.getElementById("checkout-settings")).toBeInTheDocument();
  });
});
