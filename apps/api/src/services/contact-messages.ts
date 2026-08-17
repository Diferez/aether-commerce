import { ContactMessageService, type ContactMessageRepository } from "@aether/api-core";

/** D1 adapter for persisted contact-message history. */
export function createContactMessageService(db: D1Database): ContactMessageService {
  const repository: ContactMessageRepository = {
    async save(input) {
      await db
        .prepare(
          `insert into contact_messages
            (id, name, email, subject, message, locale, email_status, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        )
        .bind(
          input.id,
          input.message.name,
          input.message.email,
          input.message.subject,
          input.message.message,
          input.message.locale,
          JSON.stringify(input.delivery)
        )
        .run();
    }
  };
  return new ContactMessageService(repository, () => crypto.randomUUID());
}
