import { describe, expect, it } from "vitest";
import { ContactMessageService, type ContactMessageRepository } from "./contact";

describe("contact messages", () => {
  it("generates the persistent identifier without knowing the email provider", async () => {
    let savedId = "";
    const repository: ContactMessageRepository = {
      save: (input) => {
        savedId = input.id;
        return Promise.resolve();
      }
    };
    const service = new ContactMessageService(repository, () => "contact-id");

    await expect(service.store({
      name: "Ada",
      email: "ada@example.com",
      subject: "Question",
      message: "A sufficiently long contact message.",
      consent: true,
      locale: "en"
    }, { queued: true })).resolves.toBe("contact-id");
    expect(savedId).toBe("contact-id");
  });
});
