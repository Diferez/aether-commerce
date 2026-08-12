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

  // Opportunistically enforce the published retention period without adding a
  // separate scheduled job. Every new submission removes records whose
  // retention window has expired before storing the new message.
  await c.env.DB.prepare(
    `delete from contact_messages
      where expires_at is not null and expires_at <= CURRENT_TIMESTAMP`
  ).run();

  await c.env.DB.prepare(
    `insert into contact_messages
      (id, name, email, subject, message, locale, email_status, consent_at,
       privacy_version, expires_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, datetime('now', '+12 months'),
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  )
    .bind(
      id,
      message.name,
      message.email,
      message.subject,
      message.message,
      message.locale,
      JSON.stringify(delivery),
      message.privacyVersion
    )
    .run();

  return ok(c, { id, emailQueued: delivery.queued }, 201);
});
