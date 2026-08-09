import type { ContactMessage, Order } from "@aether/schemas";
import type { Env } from "../types";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

async function send(env: Env, payload: EmailPayload) {
  if (!env.RESEND_API_KEY) {
    return { queued: false, provider: "resend", reason: "RESEND_API_KEY missing" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
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

export async function sendOrderEmail(env: Env, order: Order) {
  return send(env, {
    to: order.email,
    subject: `Aether order ${order.number}`,
    html: `<p>Your Aether order <strong>${order.number}</strong> is ${order.state}.</p>`
  });
}
