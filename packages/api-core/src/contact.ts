import type { ContactMessage } from "@aether/schemas";

export type ContactDelivery = Record<string, unknown> & { queued?: boolean };

export type StoredContactMessage = {
  id: string;
  message: ContactMessage;
  delivery: ContactDelivery;
};

export interface ContactMessageRepository {
  save(input: StoredContactMessage): Promise<void>;
}

/** Stores an already validated and delivered contact message without coupling to an email provider. */
export class ContactMessageService {
  constructor(
    private readonly repository: ContactMessageRepository,
    private readonly createId: () => string
  ) {}

  async store(message: ContactMessage, delivery: ContactDelivery): Promise<string> {
    const id = this.createId();
    await this.repository.save({ id, message, delivery });
    return id;
  }
}
