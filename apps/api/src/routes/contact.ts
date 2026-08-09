import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { contactMessageSchema } from "@aether/schemas";
import type { AppBindings } from "../types";
import { ok } from "../http";
import { sendContactEmail } from "../services/email";

export const contactRoutes = new Hono<AppBindings>();

function sanitize(value: string) {
  return value.replace(/[<>]/g, "").trim();
}

contactRoutes.post("/", zValidator("json", contactMessageSchema), async (c) => {
  const rawMessage = c.req.valid("json");
  if (rawMessage.website) {
    return ok(c, { id: crypto.randomUUID(), emailQueued: false, spamIgnored: true }, 201);
  }
  if (!rawMessage.consent) {
    return c.json(
      {
        success: false,
        error: { code: "CONSENT_REQUIRED", message: "Consent is required before sending a message." },
        meta: { requestId: c.get("requestId") }
      },
      422
    );
  }
  const message = {
    ...rawMessage,
    name: sanitize(rawMessage.name),
    company: rawMessage.company ? sanitize(rawMessage.company) : undefined,
    subject: sanitize(rawMessage.subject),
    message: sanitize(rawMessage.message)
  };
  const id = crypto.randomUUID();
  const delivery = await sendContactEmail(c.env, message);

  await c.env.DB.prepare(
    `insert into contact_messages
      (id, name, email, subject, message, locale, email_status, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  )
    .bind(
      id,
      message.name,
      message.email,
      message.subject,
      message.message,
      message.locale,
      JSON.stringify(delivery)
    )
    .run();

  return ok(c, { id, emailQueued: delivery.queued }, 201);
});
