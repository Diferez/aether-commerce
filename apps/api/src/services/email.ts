import type { ContactMessage, Order } from "@aether/schemas";
import type { Env } from "../types";
import { resolveIntegrationSecrets } from "./integration-settings";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

async function send(env: Env, payload: EmailPayload) {
  const { resend } = await resolveIntegrationSecrets(env);
  if (!resend.apiKey) {
    return { queued: false, provider: "resend", reason: "RESEND_API_KEY missing" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resend.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: "Aether Demo <onboarding@resend.dev>",
      ...payload
    })
  });

  return {
    queued: response.ok,
    provider: "resend",
    status: response.status
  };
}

export async function sendContactEmail(env: Env, message: ContactMessage) {
  if (!env.CONTACT_RECIPIENT_EMAIL) {
    return { queued: false, provider: "resend", reason: "CONTACT_RECIPIENT_EMAIL missing" };
  }

  return send(env, {
    to: env.CONTACT_RECIPIENT_EMAIL,
    subject: `Aether contact: ${message.subject}`,
    html: `<p><strong>${message.name}</strong> (${message.email})</p><p>${message.message}</p>`
  });
}

// Only the 3 fields the template actually needs, not the full Order record -
// every call site below already has these on hand (either a freshly built
// order object, or a fresh DB row) without also having to reassemble a
// complete, schema-valid Order just to send a status email.
export async function sendOrderEmail(env: Env, order: Pick<Order, "email" | "number" | "state">) {
  return send(env, {
    to: order.email,
    subject: `Aether order ${order.number}`,
    html: `<p>Your Aether order <strong>${order.number}</strong> is ${order.state}.</p>`
  });
}
