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
      from: env.EMAIL_FROM ?? "Aether Demo <onboarding@resend.dev>",
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
    subject: `${env.BRAND_NAME ?? "Aether"} contact: ${message.subject}`,
    html: `<p><strong>${message.name}</strong> (${message.email})</p><p>${message.message}</p>`
  });
}

// Only the 3 fields the template actually needs, not the full Order record -
// every call site below already has these on hand (either a freshly built
// order object, or a fresh DB row) without also having to reassemble a
// complete, schema-valid Order just to send a status email.
export async function sendOrderEmail(env: Env, order: Pick<Order, "email" | "number" | "state">) {
  const brandName = env.BRAND_NAME ?? "Aether";
  return send(env, {
    to: order.email,
    subject: `${brandName} order ${order.number}`,
    html: `<p>Your ${brandName} order <strong>${order.number}</strong> is ${order.state}.</p>`
  });
}

export async function sendRestockNotificationEmail(env: Env, notification: { email: string; productName: string; productUrl: string }) {
  return send(env, {
    to: notification.email,
    subject: `${notification.productName} is back in stock`,
    html: `<p><strong>${notification.productName}</strong> is back in stock.</p><p><a href="${notification.productUrl}">View product</a></p>`
  });
}

export async function sendDisputeAlertEmail(env: Env, dispute: { disputeId: string; orderNumber: string | null; reason?: string }) {
  if (!env.CONTACT_RECIPIENT_EMAIL) {
    return { queued: false, provider: "resend", reason: "CONTACT_RECIPIENT_EMAIL missing" };
  }

  return send(env, {
    to: env.CONTACT_RECIPIENT_EMAIL,
    subject: `Payment dispute opened${dispute.orderNumber ? ` for order ${dispute.orderNumber}` : ""}`,
    html: `<p>Stripe reported a new dispute (${dispute.disputeId})${dispute.orderNumber ? ` on order <strong>${dispute.orderNumber}</strong>` : ""}${dispute.reason ? ` - reason: ${dispute.reason}` : ""}.</p><p>Respond to it from the Stripe dashboard before the evidence deadline.</p>`
  });
}

export async function sendLowStockAlertEmail(env: Env, products: { name: string; stock: number }[]) {
  if (!env.CONTACT_RECIPIENT_EMAIL) {
    return { queued: false, provider: "resend", reason: "CONTACT_RECIPIENT_EMAIL missing" };
  }

  const items = products
    .map((product) => `<li>${product.name} - ${product.stock <= 0 ? "out of stock" : `${product.stock} left`}</li>`)
    .join("");
  return send(env, {
    to: env.CONTACT_RECIPIENT_EMAIL,
    subject: `${products.length} product(s) low on stock`,
    html: `<p>The following products need restocking:</p><ul>${items}</ul>`
  });
}
