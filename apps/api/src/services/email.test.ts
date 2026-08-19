import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { sendContactEmail, sendOrderEmail } from "./email";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("sendOrderEmail", () => {
  it("does not call the network when RESEND_API_KEY is not configured", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await sendOrderEmail({} as Env, { email: "shopper@example.com", number: "AETH-1", state: "paid" });

    expect(result).toEqual({ queued: false, provider: "resend", reason: "RESEND_API_KEY missing" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the shopper a status email reflecting the order's current state", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await sendOrderEmail({ RESEND_API_KEY: "re_test" } as Env, {
      email: "shopper@example.com",
      number: "AETH-1",
      state: "shipped"
    });

    expect(result).toEqual({ queued: true, provider: "resend", status: 200 });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body as string) as { to: string; subject: string; html: string };
    expect(body).toMatchObject({ to: "shopper@example.com" });
    expect(body.subject).toContain("AETH-1");
    expect(body.html).toContain("shipped");
  });

  it("reports the send as not queued when Resend rejects the request", async () => {
    global.fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 422 }))) as unknown as typeof fetch;

    const result = await sendOrderEmail({ RESEND_API_KEY: "re_test" } as Env, { email: "shopper@example.com", number: "AETH-1", state: "cancelled" });

    expect(result).toEqual({ queued: false, provider: "resend", status: 422 });
  });
});

describe("sendContactEmail", () => {
  it("does not call the network when no recipient is configured", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await sendContactEmail({} as Env, { name: "Ana", email: "ana@example.com", subject: "Hi", message: "Hello" } as never);

    expect(result).toEqual({ queued: false, provider: "resend", reason: "CONTACT_RECIPIENT_EMAIL missing" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
